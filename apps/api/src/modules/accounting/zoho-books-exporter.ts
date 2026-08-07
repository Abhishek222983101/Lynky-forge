import { AccountingExportType, AuditBookStatus, PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";

type Db = PrismaClient | any;

export class ZohoBooksExporter {
  constructor(private readonly db: Db) {}

  async build(shopId: string, exportType: AccountingExportType, dateFrom?: Date, dateTo?: Date) {
    if (exportType === AccountingExportType.sales_invoices) return this.salesInvoices(shopId, dateFrom, dateTo);
    if (exportType === AccountingExportType.audit_books) return this.auditBooks(shopId, dateFrom, dateTo);
    if (exportType === AccountingExportType.customers) return this.customers(shopId);
    if (exportType === AccountingExportType.inventory_items) return this.inventoryItems(shopId);
    if (exportType === AccountingExportType.payments) return this.payments(shopId, dateFrom, dateTo);
    return { content: this.json({ provider: "zoho_books", records: [] }), recordCount: 0 };
  }

  private async salesInvoices(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const sales = await this.db.sale.findMany({
      where: { shopId, saleDate: { gte: dateFrom, lte: dateTo } },
      include: { customer: true, invoice: true, items: true },
      orderBy: { saleDate: "asc" }
    });
    const records = sales.map((sale: any) => this.invoicePayload(sale));
    return { content: this.json({ provider: "zoho_books", apiTarget: "POST /books/v3/invoices", records }), recordCount: records.length };
  }

  private async auditBooks(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const entries = await this.db.auditBookEntry.findMany({
      where: { shopId, status: AuditBookStatus.included, sale: { saleDate: { gte: dateFrom, lte: dateTo } } },
      include: { sale: { include: { customer: true, invoice: true, items: true } } },
      orderBy: { updatedAt: "asc" }
    });
    const records = entries.map((entry: any) => ({ ...this.invoicePayload(entry.sale), audit_book_status: entry.status }));
    return { content: this.json({ provider: "zoho_books", apiTarget: "POST /books/v3/invoices", records }), recordCount: records.length };
  }

  private async customers(shopId: string) {
    const customers = await this.db.customer.findMany({ where: { shopId }, orderBy: { fullName: "asc" } });
    const records = customers.map((customer: any) => ({
      contact_name: customer.companyName || customer.fullName,
      company_name: customer.companyName ?? undefined,
      contact_type: "customer",
      phone: customer.phone ?? undefined,
      notes: customer.notes ?? undefined,
      sornam_customer_id: customer.id
    }));
    return { content: this.json({ provider: "zoho_books", apiTarget: "POST /books/v3/contacts", records }), recordCount: records.length };
  }

  private async inventoryItems(shopId: string) {
    const items = await this.db.inventoryItem.findMany({ where: { shopId }, orderBy: { name: "asc" } });
    const records = items.map((item: any) => ({
      name: item.name,
      sku: item.sku ?? undefined,
      product_type: "goods",
      unit: "g",
      rate: item.estimatedValue ? new Decimal(item.estimatedValue).toNumber() : undefined,
      description: [item.purity, item.huidNumber ? `HUID ${item.huidNumber}` : undefined].filter(Boolean).join(" "),
      sornam_inventory_item_id: item.id
    }));
    return { content: this.json({ provider: "zoho_books", apiTarget: "POST /books/v3/items", records }), recordCount: records.length };
  }

  private async payments(shopId: string, dateFrom?: Date, dateTo?: Date) {
    const payments = await this.db.payment.findMany({
      where: { shopId, paymentDate: { gte: dateFrom, lte: dateTo } },
      include: { sale: { include: { customer: true, invoice: true } } },
      orderBy: { paymentDate: "asc" }
    });
    const records = payments.map((payment: any) => ({
      customer_id: null,
      invoice_id: null,
      amount: new Decimal(payment.amount).toNumber(),
      date: this.date(payment.paymentDate),
      payment_mode: payment.paymentMethod,
      reference_number: payment.referenceNumber ?? undefined,
      description: payment.notes ?? `Payment recorded in Sornam AI for ${payment.sale?.invoice?.invoiceNumber ?? payment.sale?.saleNumber ?? "sale"}`,
      sornam_payment_id: payment.id,
      sornam_sale_id: payment.saleId,
      mapping_required: ["customer_id", "invoice_id"]
    }));
    return { content: this.json({ provider: "zoho_books", apiTarget: "POST /books/v3/customerpayments", records }), recordCount: records.length };
  }

  private invoicePayload(sale: any) {
    return {
      customer_id: null,
      invoice_number: sale.invoice?.invoiceNumber ?? sale.saleNumber,
      reference_number: sale.saleNumber,
      date: this.date(sale.saleDate),
      gst_treatment: sale.invoice?.gstNumber ? "business_gst" : undefined,
      gst_no: sale.invoice?.gstNumber ?? undefined,
      is_inclusive_tax: false,
      allow_partial_payments: true,
      line_items: sale.items.map((item: any) => ({
        item_id: null,
        name: `${item.purity} ${item.itemName}`,
        description: [item.huidNumber ? `HUID ${item.huidNumber}` : undefined, `${new Decimal(item.netWeight).toFixed(3)} g at Rs ${new Decimal(item.goldRatePerGram).toFixed(2)}/g`].filter(Boolean).join(" · "),
        quantity: new Decimal(item.netWeight).toNumber(),
        unit: "g",
        rate: new Decimal(item.lineSubtotal).plus(item.makingChargeAmount).plus(item.hallmarkingChargeAmount).div(item.netWeight).toDecimalPlaces(2).toNumber(),
        item_total: new Decimal(item.lineTotal).toNumber(),
        tax_name: new Decimal(item.gstAmount).gt(0) ? "GST" : undefined,
        tax_percentage: new Decimal(item.gstAmount).gt(0) ? 3 : undefined,
        sornam_sale_item_id: item.id,
        mapping_required: ["item_id"]
      })),
      notes: "Generated from a confirmed Sornam AI sale.",
      terms: "Payment due as per shop policy.",
      sornam_sale_id: sale.id,
      mapping_required: ["customer_id"]
    };
  }

  private json(value: unknown) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  private date(value: Date) {
    return new Date(value).toISOString().slice(0, 10);
  }
}
