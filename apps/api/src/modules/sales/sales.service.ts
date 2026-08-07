import { Injectable } from "@nestjs/common";
import { ConfirmationStatus, EInvoiceStatus, PaymentMethod, PaymentStatus, Prisma, Source, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { BillingService } from "@/modules/billing/billing.service";
import { InvoicePdfService } from "@/modules/billing/invoice-pdf.service";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { EventsService } from "@/modules/integrations/events/events.service";
import { InventoryService } from "@/modules/inventory/inventory.service";
import { ManualSaleDto, ListSalesQuery } from "./sales.schemas";

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly audit: AuditLogsService,
    private readonly events: EventsService,
    private readonly inventory: InventoryService
  ) {}

  async createManual(input: ManualSaleDto, actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Sales require a shop user", 400);
    if (actor.role !== UserRole.owner && actor.role !== UserRole.salesperson && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
    return this.createConfirmedSale(this.prisma, actor.shopId, actor, input, Source.manual, "manual_api");
  }

  async createVoiceConfirmed(input: ManualSaleDto, actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Sales require a shop user", 400);
    if (actor.role !== UserRole.owner && actor.role !== UserRole.salesperson && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
    return this.createConfirmedSale(this.prisma, actor.shopId, actor, input, Source.voice_app, "voice_command");
  }

  async createConfirmedSale(dbRoot: PrismaService, shopId: string, actor: AuthUser, input: ManualSaleDto, source: Source, auditSource: string) {
    if (actor.role !== UserRole.admin && actor.shopId !== shopId) throw new AppError("Invalid shop scope", 403);
    const sale = await dbRoot.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({ where: { id: shopId } });
      if (!shop?.isActive) throw new AppError("Shop not found", 404);
      const billing = this.billing.calculateSale({ items: input.items, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod });
      const customer = await this.resolveCustomer(tx, shopId, input.customer);
      const allocated = await this.allocateNumbers(tx, shopId);
      const saleNumber = `S-${String(allocated.saleSequence).padStart(6, "0")}`;
      const invoiceNumber = `INV-${String(allocated.invoiceSequence).padStart(6, "0")}`;
      const sale = await tx.sale.create({
        data: {
          shopId,
          customerId: customer?.id,
          saleNumber,
          saleDate: input.saleDate ?? new Date(),
          subtotalAmount: billing.subtotalAmount.toString(),
          makingChargeAmount: billing.makingChargeAmount.toString(),
          hallmarkingChargeAmount: billing.hallmarkingChargeAmount.toString(),
          gstAmount: billing.gstAmount.toString(),
          totalAmount: billing.totalAmount.toString(),
          amountPaid: billing.amountPaid.toString(),
          pendingAmount: billing.pendingAmount.toString(),
          paymentStatus: billing.paymentStatus as PaymentStatus,
          source,
          confirmationStatus: ConfirmationStatus.confirmed,
          confirmedBy: actor.id,
          confirmedAt: new Date(),
          items: {
            create: billing.lines.map((line) => ({
              shopId,
              inventoryItemId: line.item.inventoryItemId ?? undefined,
              itemName: line.item.itemName,
              purity: line.item.purity,
              grossWeight: new Decimal(line.item.grossWeight).toString(),
              netWeight: new Decimal(line.item.netWeight).toString(),
              goldRatePerGram: new Decimal(line.item.goldRatePerGram).toString(),
              makingChargeType: line.item.makingChargeType,
              makingChargeValue: new Decimal(line.item.makingChargeValue).toString(),
              makingChargeAmount: line.makingChargeAmount.toString(),
              hallmarkingChargeAmount: new Decimal(line.item.hallmarkingChargeAmount ?? 0).toString(),
              lineSubtotal: line.lineSubtotal.toString(),
              gstAmount: line.gstAmount.toString(),
              lineTotal: line.lineTotal.toString(),
              huidNumber: line.item.huidNumber ?? undefined
            }))
          }
        }
      });
      await this.inventory.applySaleConfirmed(tx, shopId, actor.id, sale.id, input.items);
      if (billing.amountPaid.gt(0)) {
        const payment = await tx.payment.create({
          data: {
            shopId,
            saleId: sale.id,
            customerId: customer?.id,
            amount: billing.amountPaid.toString(),
            paymentMethod: input.paymentMethod,
            paymentDate: sale.saleDate,
            referenceNumber: input.referenceNumber,
            notes: input.notes,
            createdBy: actor.id
          }
        });
        await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "payment.created", entityType: "payment", entityId: payment.id, source: auditSource, afterData: { amount: billing.amountPaid.toString() } });
      }
      if (billing.pendingAmount.gt(0)) {
        const pending = await tx.pendingPayment.create({ data: { shopId, saleId: sale.id, customerId: customer?.id, amount: billing.pendingAmount.toString() } });
        await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "pending_payment.created", entityType: "pending_payment", entityId: pending.id, source: auditSource, afterData: { amount: billing.pendingAmount.toString() } });
      }
      const invoice = await tx.invoice.create({
        data: {
          shopId,
          saleId: sale.id,
          invoiceNumber,
          gstNumber: shop.gstNumber,
          taxableAmount: billing.subtotalAmount.plus(billing.makingChargeAmount).plus(billing.hallmarkingChargeAmount).toString(),
          gstAmount: billing.gstAmount.toString(),
          totalAmount: billing.totalAmount.toString(),
          eInvoiceStatus: EInvoiceStatus.pending_generation
        }
      });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "invoice.created", entityType: "invoice", entityId: invoice.id, source: auditSource, afterData: { invoiceNumber: invoice.invoiceNumber } });
      await tx.auditBookEntry.create({ data: { shopId, saleId: sale.id, invoiceId: invoice.id, updatedBy: actor.id } });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "sale.created", entityType: "sale", entityId: sale.id, source: auditSource, afterData: { saleNumber, totalAmount: billing.totalAmount.toString() } });
      await this.events.publish(tx, shopId, "sale.confirmed", { shopId, saleId: sale.id, customerId: customer?.id ?? null, items: input.items });
      if (customer) await this.events.publish(tx, shopId, "customer.sale_recorded", { shopId, customerId: customer.id, saleId: sale.id, totalAmount: billing.totalAmount.toString(), saleDate: sale.saleDate.toISOString() });
      return this.findByIdTx(tx, shopId, sale.id);
    });
    if (sale?.invoice?.id) {
      await this.invoicePdf.generate(sale.invoice.id, shopId);
      return this.findById(actor, sale.id);
    }
    return sale;
  }

  async list(actor: AuthUser, query: ListSalesQuery) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return this.prisma.sale.findMany({
      where: {
        shopId: actor.shopId,
        saleDate: { gte: query.dateFrom, lte: query.dateTo },
        customerId: query.customerId,
        paymentStatus: query.paymentStatus
      },
      include: this.includeGraph(),
      orderBy: { saleDate: "desc" }
    });
  }

  async findById(actor: AuthUser, saleId: string) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    const sale = await this.findByIdTx(this.prisma, actor.shopId, saleId);
    if (!sale) throw new AppError("Sale not found", 404);
    return sale;
  }

  async todaySummary(shopId: string, day = new Date()) {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    const sales = await this.prisma.sale.findMany({ where: { shopId, saleDate: { gte: start, lte: end } }, include: { items: true } });
    const cash = await this.prisma.payment.aggregate({ where: { shopId, paymentDate: { gte: start, lte: end }, paymentMethod: PaymentMethod.cash }, _sum: { amount: true } });
    return {
      date: start.toISOString().slice(0, 10),
      totalSales: sales.length,
      totalAmount: sales.reduce((sum, sale) => sum.plus(sale.totalAmount), new Decimal(0)).toString(),
      cashCollected: new Decimal(cash._sum.amount ?? 0).toString(),
      pendingAmount: sales.reduce((sum, sale) => sum.plus(sale.pendingAmount), new Decimal(0)).toString(),
      piecesSold: sales.reduce((sum, sale) => sum + sale.items.length, 0)
    };
  }

  private async resolveCustomer(tx: Prisma.TransactionClient, shopId: string, customer?: ManualSaleDto["customer"]) {
    if (!customer) return null;
    if (customer.id) {
      const existing = await tx.customer.findFirst({ where: { id: customer.id, shopId } });
      if (!existing) throw new AppError("Customer not found", 404);
      return existing;
    }
    if (customer.phone) {
      const existing = await tx.customer.findFirst({ where: { shopId, phone: customer.phone } });
      if (existing) return existing;
    }
    if (!customer.fullName) return null;
    return tx.customer.create({ data: { shopId, fullName: customer.fullName, phone: customer.phone, preferredLanguage: customer.preferredLanguage } });
  }

  private includeGraph() {
    return { customer: true, items: true, payments: true, invoice: true, pendingPayment: true };
  }

  private findByIdTx(db: Prisma.TransactionClient | PrismaService, shopId: string, saleId: string) {
    return db.sale.findFirst({ where: { id: saleId, shopId }, include: this.includeGraph() });
  }

  private async allocateNumbers(tx: Prisma.TransactionClient, shopId: string) {
    const counter = await tx.saleCounter.upsert({
      where: { shopId },
      create: {
        shopId,
        nextSaleNumber: 2,
        nextInvoiceNumber: 2,
      },
      update: {
        nextSaleNumber: { increment: 1 },
        nextInvoiceNumber: { increment: 1 },
      },
    });
    return {
      saleSequence: counter.nextSaleNumber - 1,
      invoiceSequence: counter.nextInvoiceNumber - 1,
    };
  }
}
