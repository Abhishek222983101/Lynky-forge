import { AccountingExportType, AuditBookStatus, PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { toCsv } from "./csv";

type Db = PrismaClient | any;

export class VyaparExporter {
  constructor(private readonly db: Db) {}

  async build(shopId: string, exportType: AccountingExportType, dateFrom?: Date, dateTo?: Date) {
    if (exportType === AccountingExportType.sales_invoices) return this.salesInvoices(shopId, dateFrom, dateTo);
    if (exportType === AccountingExportType.payments) return this.payments(shopId, dateFrom, dateTo);
    if (exportType === AccountingExportType.customers) return this.customers(shopId);
    if (exportType === AccountingExportType.inventory_items) return this.inventoryItems(shopId);
    if (exportType === AccountingExportType.audit_books) return this.auditBooks(shopId, dateFrom, dateTo);
    return { content: "", recordCount: 0 };
  }

  private async salesInvoices(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const sales = await this.db.sale.findMany({
      where: { shopId, saleDate: { gte: dateFrom, lte: dateTo } },
      include: { customer: true, invoice: true, items: true },
      orderBy: { saleDate: "asc" }
    });
    const rows = sales.flatMap((sale: any) => sale.items.map((item: any) => this.saleItemRow(sale, item)));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async auditBooks(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const entries = await this.db.auditBookEntry.findMany({
      where: { shopId, status: AuditBookStatus.included, sale: { saleDate: { gte: dateFrom, lte: dateTo } } },
      include: { sale: { include: { customer: true, invoice: true, items: true } } },
      orderBy: { updatedAt: "asc" }
    });
    const rows = entries.flatMap((entry: any) => entry.sale.items.map((item: any) => ({
      ...this.saleItemRow(entry.sale, item),
      auditBookStatus: entry.status
    })));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async payments(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const payments = await this.db.payment.findMany({
      where: { shopId, paymentDate: { gte: dateFrom, lte: dateTo } },
      include: { sale: { include: { customer: true } } },
      orderBy: { paymentDate: "asc" }
    });
    const rows = payments.map((payment: any) => ({
      paymentDate: this.date(payment.paymentDate),
      customerName: payment.sale?.customer?.fullName ?? "",
      customerPhone: payment.sale?.customer?.phone ?? "",
      saleNumber: payment.sale?.saleNumber ?? "",
      amount: new Decimal(payment.amount).toFixed(2),
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber ?? "",
      notes: payment.notes ?? ""
    }));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async customers(shopId: string) {
    const customers = await this.db.customer.findMany({ where: { shopId }, orderBy: { fullName: "asc" } });
    const rows = customers.map((customer: any) => ({
      name: customer.fullName,
      phone: customer.phone ?? "",
      customerType: customer.customerType,
      companyName: customer.companyName ?? "",
      preferredLanguage: customer.preferredLanguage ?? "",
      notes: customer.notes ?? ""
    }));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async inventoryItems(shopId: string) {
    const items = await this.db.inventoryItem.findMany({ where: { shopId }, orderBy: { name: "asc" } });
    const rows = items.map((item: any) => ({
      sku: item.sku ?? "",
      itemName: item.name,
      category: item.category ?? "",
      purity: item.purity,
      huidNumber: item.huidNumber ?? "",
      grossWeight: item.grossWeight ? new Decimal(item.grossWeight).toFixed(3) : "",
      netWeight: item.netWeight ? new Decimal(item.netWeight).toFixed(3) : "",
      estimatedValue: item.estimatedValue ? new Decimal(item.estimatedValue).toFixed(2) : "",
      status: item.status,
      location: item.location ?? ""
    }));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private saleItemRow(sale: any, item: any) {
    return {
      invoiceNumber: sale.invoice?.invoiceNumber ?? "",
      saleNumber: sale.saleNumber,
      saleDate: this.date(sale.saleDate),
      customerName: sale.customer?.fullName ?? "Walk-in Customer",
      customerPhone: sale.customer?.phone ?? "",
      itemName: item.itemName,
      purity: item.purity,
      huidNumber: item.huidNumber ?? "",
      grossWeight: new Decimal(item.grossWeight).toFixed(3),
      netWeight: new Decimal(item.netWeight).toFixed(3),
      ratePerGram: new Decimal(item.goldRatePerGram).toFixed(2),
      makingCharge: new Decimal(item.makingChargeAmount).toFixed(2),
      hallmarkingCharge: new Decimal(item.hallmarkingChargeAmount).toFixed(2),
      taxableAmount: new Decimal(item.lineSubtotal).plus(item.makingChargeAmount).plus(item.hallmarkingChargeAmount).toFixed(2),
      gstAmount: new Decimal(item.gstAmount).toFixed(2),
      lineTotal: new Decimal(item.lineTotal).toFixed(2),
      amountPaid: new Decimal(sale.amountPaid).toFixed(2),
      pendingAmount: new Decimal(sale.pendingAmount).toFixed(2),
      paymentStatus: sale.paymentStatus
    };
  }

  private date(value: Date) {
    return new Date(value).toISOString().slice(0, 10);
  }
}
