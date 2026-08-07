import { AccountingExportType, AuditBookStatus, PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { toCsv } from "./csv";

type Db = PrismaClient | any;

export class BusyExporter {
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
    const rows = sales.flatMap((sale: any) => sale.items.map((item: any) => this.saleRow(sale, item, "Sales")));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async auditBooks(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const entries = await this.db.auditBookEntry.findMany({
      where: { shopId, status: AuditBookStatus.included, sale: { saleDate: { gte: dateFrom, lte: dateTo } } },
      include: { sale: { include: { customer: true, invoice: true, items: true } } },
      orderBy: { updatedAt: "asc" }
    });
    const rows = entries.flatMap((entry: any) => entry.sale.items.map((item: any) => this.saleRow(entry.sale, item, "Sales")));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async payments(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const payments = await this.db.payment.findMany({
      where: { shopId, paymentDate: { gte: dateFrom, lte: dateTo } },
      include: { sale: { include: { customer: true } } },
      orderBy: { paymentDate: "asc" }
    });
    const rows = payments.map((payment: any) => ({
      "Voucher Type": "Receipt",
      "Voucher Date": this.date(payment.paymentDate),
      "Voucher No": payment.referenceNumber ?? payment.id,
      "Party Name": payment.sale?.customer?.fullName ?? "Customer",
      "Debit Ledger": this.paymentLedger(payment.paymentMethod),
      "Credit Ledger": payment.sale?.customer?.fullName ?? "Customer",
      Amount: new Decimal(payment.amount).toFixed(2),
      Narration: payment.notes ?? `Receipt against ${payment.sale?.saleNumber ?? "sale"}`
    }));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async customers(shopId: string) {
    const customers = await this.db.customer.findMany({ where: { shopId }, orderBy: { fullName: "asc" } });
    const rows = customers.map((customer: any) => ({
      "Ledger Name": customer.fullName,
      Group: customer.customerType === "wholesale" ? "Sundry Debtors" : "Sundry Debtors",
      Mobile: customer.phone ?? "",
      "GST No": "",
      Address: customer.notes ?? "",
      "Opening Balance": "0.00"
    }));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private async inventoryItems(shopId: string) {
    const items = await this.db.inventoryItem.findMany({ where: { shopId }, orderBy: { name: "asc" } });
    const rows = items.map((item: any) => ({
      "Item Name": item.name,
      Alias: item.sku ?? "",
      Group: item.category ?? "Jewellery",
      Unit: "g",
      HUID: item.huidNumber ?? "",
      Purity: item.purity,
      "Opening Qty": item.netWeight ? new Decimal(item.netWeight).toFixed(3) : "",
      "Opening Value": item.estimatedValue ? new Decimal(item.estimatedValue).toFixed(2) : ""
    }));
    return { content: toCsv(rows), recordCount: rows.length };
  }

  private saleRow(sale: any, item: any, voucherType: string) {
    const taxableAmount = new Decimal(item.lineSubtotal).plus(item.makingChargeAmount).plus(item.hallmarkingChargeAmount);
    return {
      "Voucher Type": voucherType,
      "Voucher Date": this.date(sale.saleDate),
      "Voucher No": sale.invoice?.invoiceNumber ?? sale.saleNumber,
      "Party Name": sale.customer?.fullName ?? "Walk-in Customer",
      "Item Name": item.itemName,
      HUID: item.huidNumber ?? "",
      Purity: item.purity,
      Quantity: new Decimal(item.netWeight).toFixed(3),
      Unit: "g",
      Rate: new Decimal(item.goldRatePerGram).toFixed(2),
      "Taxable Amount": taxableAmount.toFixed(2),
      "GST Amount": new Decimal(item.gstAmount).toFixed(2),
      "Invoice Total": new Decimal(item.lineTotal).toFixed(2),
      "Paid Amount": new Decimal(sale.amountPaid).toFixed(2),
      "Pending Amount": new Decimal(sale.pendingAmount).toFixed(2)
    };
  }

  private paymentLedger(method: string) {
    if (method === "cash") return "Cash";
    if (method === "upi") return "UPI";
    if (method === "card") return "Card Receipts";
    if (method === "bank_transfer") return "Bank";
    return "Receipts";
  }

  private date(value: Date) {
    return new Date(value).toISOString().slice(0, 10);
  }
}
