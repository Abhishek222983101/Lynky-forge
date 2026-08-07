import { AccountingExportType, AuditBookStatus, PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { escapeXml } from "./xml";

type Db = PrismaClient | any;

export class TallyExporter {
  constructor(private readonly db: Db) {}

  async build(shopId: string, exportType: AccountingExportType, options: { dateFrom?: Date; dateTo?: Date; companyName: string }) {
    if (exportType === AccountingExportType.sales_invoices) return this.salesInvoices(shopId, options);
    if (exportType === AccountingExportType.payments) return this.payments(shopId, options);
    if (exportType === AccountingExportType.customers) return this.customers(shopId, options.companyName);
    if (exportType === AccountingExportType.inventory_items) return this.inventoryItems(shopId, options.companyName);
    if (exportType === AccountingExportType.audit_books) return this.auditBooks(shopId, options);
    return { content: this.envelope("Vouchers", options.companyName, ""), recordCount: 0 };
  }

  private async salesInvoices(shopId: string, options: { dateFrom?: Date; dateTo?: Date; companyName: string }) {
    const sales = await this.db.sale.findMany({
      where: { shopId, saleDate: { gte: options.dateFrom, lte: options.dateTo } },
      include: { customer: true, invoice: true, items: true },
      orderBy: { saleDate: "asc" }
    });
    const messages = sales.map((sale: any) => this.saleVoucher(sale)).join("\n");
    return { content: this.envelope("Vouchers", options.companyName, messages), recordCount: sales.length };
  }

  private async auditBooks(shopId: string, options: { dateFrom?: Date; dateTo?: Date; companyName: string }) {
    const entries = await this.db.auditBookEntry.findMany({
      where: { shopId, status: AuditBookStatus.included, sale: { saleDate: { gte: options.dateFrom, lte: options.dateTo } } },
      include: { sale: { include: { customer: true, invoice: true, items: true } } },
      orderBy: { updatedAt: "asc" }
    });
    const messages = entries.map((entry: any) => this.saleVoucher(entry.sale)).join("\n");
    return { content: this.envelope("Vouchers", options.companyName, messages), recordCount: entries.length };
  }

  private async payments(shopId: string, options: { dateFrom?: Date; dateTo?: Date; companyName: string }) {
    const payments = await this.db.payment.findMany({
      where: { shopId, paymentDate: { gte: options.dateFrom, lte: options.dateTo } },
      include: { sale: { include: { customer: true } } },
      orderBy: { paymentDate: "asc" }
    });
    const messages = payments.map((payment: any) => this.paymentVoucher(payment)).join("\n");
    return { content: this.envelope("Vouchers", options.companyName, messages), recordCount: payments.length };
  }

  private async customers(shopId: string, companyName: string) {
    const customers = await this.db.customer.findMany({ where: { shopId }, orderBy: { fullName: "asc" } });
    const messages = customers.map((customer: any) => `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <LEDGER NAME="${escapeXml(customer.fullName)}" RESERVEDNAME="">
          <NAME>${escapeXml(customer.fullName)}</NAME>
          <PARENT>Sundry Debtors</PARENT>
          <ISBILLWISEON>Yes</ISBILLWISEON>
          <LEDGERPHONE>${escapeXml(customer.phone ?? "")}</LEDGERPHONE>
        </LEDGER>
      </TALLYMESSAGE>`).join("\n");
    return { content: this.envelope("All Masters", companyName, messages), recordCount: customers.length };
  }

  private async inventoryItems(shopId: string, companyName: string) {
    const items = await this.db.inventoryItem.findMany({ where: { shopId }, orderBy: { name: "asc" } });
    const messages = items.map((item: any) => `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <STOCKITEM NAME="${escapeXml(item.name)}" RESERVEDNAME="">
          <NAME>${escapeXml(item.name)}</NAME>
          <PARENT>${escapeXml(item.category ?? "Jewellery")}</PARENT>
          <BASEUNITS>g</BASEUNITS>
          <DESCRIPTION>${escapeXml([item.purity, item.huidNumber].filter(Boolean).join(" "))}</DESCRIPTION>
        </STOCKITEM>
      </TALLYMESSAGE>`).join("\n");
    return { content: this.envelope("All Masters", companyName, messages), recordCount: items.length };
  }

  private saleVoucher(sale: any) {
    const partyName = sale.customer?.fullName ?? "Walk-in Customer";
    const date = this.tallyDate(sale.saleDate);
    const voucherNumber = sale.invoice?.invoiceNumber ?? sale.saleNumber;
    const taxableAmount = new Decimal(sale.subtotalAmount).plus(sale.makingChargeAmount).plus(sale.hallmarkingChargeAmount);
    return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Sales" ACTION="Create">
          <DATE>${date}</DATE>
          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
          <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
          <NARRATION>${escapeXml(`Imported from Sornam AI sale ${sale.saleNumber}`)}</NARRATION>
          ${this.ledgerEntry(partyName, new Decimal(sale.totalAmount).negated(), true, voucherNumber)}
          ${this.ledgerEntry("Jewellery Sales", taxableAmount, false)}
          ${new Decimal(sale.gstAmount).gt(0) ? this.ledgerEntry("Output GST", new Decimal(sale.gstAmount), false) : ""}
          ${sale.items.map((item: any) => this.inventoryEntry(item)).join("\n")}
        </VOUCHER>
      </TALLYMESSAGE>`;
  }

  private paymentVoucher(payment: any) {
    const partyName = payment.sale?.customer?.fullName ?? "Customer";
    const bankLedger = this.paymentLedger(payment.paymentMethod);
    return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Receipt" ACTION="Create">
          <DATE>${this.tallyDate(payment.paymentDate)}</DATE>
          <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${escapeXml(payment.id)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
          <NARRATION>${escapeXml(`Imported from Sornam AI payment ${payment.referenceNumber ?? payment.id}`)}</NARRATION>
          ${this.ledgerEntry(bankLedger, new Decimal(payment.amount).negated(), true)}
          ${this.ledgerEntry(partyName, new Decimal(payment.amount), false)}
        </VOUCHER>
      </TALLYMESSAGE>`;
  }

  private ledgerEntry(name: string, amount: Decimal, isPartyLedger: boolean, billReference?: string) {
    return `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${escapeXml(name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${amount.lt(0) ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
        <ISPARTYLEDGER>${isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>
        <AMOUNT>${amount.toFixed(2)}</AMOUNT>
        ${billReference ? `
        <BILLALLOCATIONS.LIST>
          <NAME>${escapeXml(billReference)}</NAME>
          <BILLTYPE>New Ref</BILLTYPE>
          <AMOUNT>${amount.toFixed(2)}</AMOUNT>
        </BILLALLOCATIONS.LIST>` : ""}
      </ALLLEDGERENTRIES.LIST>`;
  }

  private inventoryEntry(item: any) {
    return `
      <INVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${new Decimal(item.goldRatePerGram).toFixed(2)}/g</RATE>
        <AMOUNT>${new Decimal(item.lineSubtotal).negated().toFixed(2)}</AMOUNT>
        <ACTUALQTY>${new Decimal(item.netWeight).toFixed(3)} g</ACTUALQTY>
        <BILLEDQTY>${new Decimal(item.netWeight).toFixed(3)} g</BILLEDQTY>
      </INVENTORYENTRIES.LIST>`;
  }

  private envelope(reportName: "Vouchers" | "All Masters", companyName: string, messages: string) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${reportName}</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${messages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  private tallyDate(date: Date) {
    const value = new Date(date);
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  }

  private paymentLedger(method: string) {
    if (method === "cash") return "Cash";
    if (method === "upi") return "UPI";
    if (method === "card") return "Card Receipts";
    if (method === "bank_transfer") return "Bank";
    return "Receipts";
  }
}
