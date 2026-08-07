import { Injectable } from "@nestjs/common";
import { ScanBillStatus, Source, UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { BillingService } from "@/modules/billing/billing.service";
import { SalesService } from "@/modules/sales/sales.service";
import { manualSaleSchema } from "@/modules/sales/sales.schemas";
import { ScanBillConfirmDto, ScanBillCreateDto } from "./scan-bill.schemas";

@Injectable()
export class ScanBillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly sales: SalesService,
    private readonly audit: AuditLogsService
  ) {}

  async create(actor: AuthUser, input: ScanBillCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    if (!input.extractedPayload) {
      const job = await this.prisma.scanBillJob.create({
        data: {
          shopId,
          sourceFileUrl: input.sourceFileUrl ?? undefined,
          rawText: input.rawText ?? undefined,
          status: ScanBillStatus.failed,
          failureReason: "OCR provider is not configured. Submit extractedPayload to continue this flow.",
          createdBy: actor.id
        }
      });
      await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "scan_bill.failed", entityType: "scan_bill_job", entityId: job.id, source: "scan_bill_api", afterData: { reason: job.failureReason } });
      return job;
    }
    const parsed = manualSaleSchema.parse(input.extractedPayload);
    const totals = this.billing.calculateSale({ items: parsed.items, amountPaid: parsed.amountPaid, paymentMethod: parsed.paymentMethod });
    const job = await this.prisma.scanBillJob.create({
      data: {
        shopId,
        sourceFileUrl: input.sourceFileUrl ?? undefined,
        rawText: input.rawText ?? undefined,
        extractedPayload: parsed,
        status: ScanBillStatus.awaiting_confirmation,
        createdBy: actor.id
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "scan_bill.awaiting_confirmation", entityType: "scan_bill_job", entityId: job.id, source: "scan_bill_api", afterData: { totalAmount: totals.totalAmount.toString(), pendingAmount: totals.pendingAmount.toString() } });
    return {
      ...job,
      confirmationMessage: `Scanned bill total is Rs ${totals.totalAmount.toString()} with Rs ${totals.pendingAmount.toString()} pending. Confirm to create sale and invoice.`,
      calculatedTotals: totals
    };
  }

  list(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    return this.prisma.scanBillJob.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async confirm(actor: AuthUser, jobId: string, input: ScanBillConfirmDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    const yes = ["yes", "y", "confirm", "save", "ok"].includes(input.confirmation.trim().toLowerCase());
    const no = ["no", "n", "cancel", "reject"].includes(input.confirmation.trim().toLowerCase());
    const job = await this.prisma.scanBillJob.findFirst({ where: { id: jobId, shopId } });
    if (!job) throw new AppError("Scan bill job not found", 404);
    if (job.status !== ScanBillStatus.awaiting_confirmation) throw new AppError("Scan bill job is not awaiting confirmation", 409);
    if (no) {
      const cancelled = await this.prisma.scanBillJob.update({ where: { id: job.id }, data: { status: ScanBillStatus.cancelled } });
      await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "scan_bill.cancelled", entityType: "scan_bill_job", entityId: job.id, source: "scan_bill_api" });
      return cancelled;
    }
    if (!yes) throw new AppError("Explicit confirmation is required", 422);
    const payload = manualSaleSchema.parse(job.extractedPayload);
    const sale = await this.sales.createConfirmedSale(this.prisma, shopId, actor, payload, Source.manual, "scan_bill_api");
    if (!sale) throw new AppError("Sale creation failed", 500);
    const updated = await this.prisma.scanBillJob.update({
      where: { id: job.id },
      data: {
        status: ScanBillStatus.converted,
        createdCustomerId: sale.customerId ?? undefined,
        createdSaleId: sale.id,
        createdInvoiceId: sale.invoice?.id
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "scan_bill.converted", entityType: "scan_bill_job", entityId: job.id, source: "scan_bill_api", afterData: { saleId: sale.id, invoiceId: sale.invoice?.id } });
    return { job: updated, sale };
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireWrite(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.salesperson && actor.role !== UserRole.admin) {
      throw new AppError("Insufficient permissions", 403);
    }
  }
}
