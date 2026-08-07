import { Injectable } from "@nestjs/common";
import { EInvoiceStatus } from "@prisma/client";
import Decimal from "decimal.js";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";

type InvoiceGraph = NonNullable<Awaited<ReturnType<InvoicePdfService["loadInvoiceGraph"]>>>;

@Injectable()
export class InvoicePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForSale(shopId: string, saleId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { shopId, saleId } });
    if (!invoice) throw new AppError("Invoice not found", 404);
    return this.generate(invoice.id, shopId);
  }

  async generate(invoiceId: string, shopId: string) {
    const invoice = await this.loadInvoiceGraph(invoiceId, shopId);
    if (!invoice) throw new AppError("Invoice not found", 404);
    const storageRoot = this.storageRoot();
    const shopDir = path.join(storageRoot, "shops", shopId, "invoices");
    await fs.promises.mkdir(shopDir, { recursive: true });
    const fileName = `${invoice.invoiceNumber}.pdf`;
    const absolutePath = path.join(shopDir, fileName);

    try {
      await this.writeInvoicePdf(invoice, absolutePath);
      const pdfUrl = `/api/v1/billing/invoices/${invoice.id}/pdf`;
      return this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfUrl, eInvoiceStatus: EInvoiceStatus.generated }
      });
    } catch (error) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { eInvoiceStatus: EInvoiceStatus.failed }
      });
      throw error;
    }
  }

  async getPdf(invoiceId: string, shopId: string) {
    const invoice = await this.loadInvoiceGraph(invoiceId, shopId);
    if (!invoice) throw new AppError("Invoice not found", 404);
    const absolutePath = this.invoicePath(shopId, invoice.invoiceNumber);
    if (!fs.existsSync(absolutePath)) {
      await this.generate(invoiceId, shopId);
    }
    return { invoice, absolutePath };
  }

  private loadInvoiceGraph(invoiceId: string, shopId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, shopId },
      include: {
        sale: {
          include: {
            customer: true,
            items: true,
            payments: true,
            pendingPayment: true
          }
        }
      }
    });
  }

  private writeInvoicePdf(invoice: InvoiceGraph, absolutePath: string) {
    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true });
      const stream = fs.createWriteStream(absolutePath);
      stream.on("finish", resolve);
      stream.on("error", reject);
      doc.on("error", reject);
      doc.pipe(stream);

      const sale = invoice.sale;
      const shopName = "Sornam AI Jewellery";
      const customerName = sale.customer?.fullName ?? "Walk-in Customer";
      const invoiceDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(sale.saleDate);

      doc.info.Title = `Invoice ${invoice.invoiceNumber}`;
      doc.info.Author = shopName;
      doc.rect(0, 0, doc.page.width, 98).fill("#0E0E10");
      doc.fillColor("#FBEDB4").font("Helvetica-Bold").fontSize(24).text(shopName, 44, 32);
      doc.fillColor("#E7DFCE").font("Helvetica").fontSize(10).text("GST-ready tax invoice", 44, 62);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(18).text("TAX INVOICE", 390, 32, { align: "right" });
      doc.fillColor("#E7DFCE").font("Helvetica").fontSize(10).text(invoice.invoiceNumber, 390, 58, { align: "right" });

      let y = 124;
      doc.fillColor("#1A1814").font("Helvetica-Bold").fontSize(11).text("Billed To", 44, y);
      doc.font("Helvetica").fontSize(10).fillColor("#5B564C").text(customerName, 44, y + 18);
      if (sale.customer?.phone) doc.text(sale.customer.phone, 44, y + 34);

      doc.fillColor("#1A1814").font("Helvetica-Bold").fontSize(11).text("Invoice Details", 360, y);
      doc.font("Helvetica").fontSize(10).fillColor("#5B564C");
      doc.text(`Date: ${invoiceDate}`, 360, y + 18);
      doc.text(`Sale: ${sale.saleNumber}`, 360, y + 34);
      doc.text(`GSTIN: ${invoice.gstNumber ?? "Not provided"}`, 360, y + 50);

      y = 220;
      this.tableHeader(doc, y);
      y += 28;
      sale.items.forEach((item, index) => {
        this.tableRow(doc, y, {
          sno: String(index + 1),
          item: `${item.purity} ${item.itemName}`,
          weight: `${new Decimal(item.netWeight).toFixed(3)} g`,
          rate: this.inr(item.goldRatePerGram),
          making: this.inr(item.makingChargeAmount),
          gst: this.inr(item.gstAmount),
          total: this.inr(item.lineTotal)
        });
        y += 30;
      });

      y += 18;
      this.totalLine(doc, y, "Taxable amount", this.inr(invoice.taxableAmount)); y += 22;
      this.totalLine(doc, y, "GST amount", this.inr(invoice.gstAmount)); y += 22;
      this.totalLine(doc, y, "Total amount", this.inr(invoice.totalAmount), true); y += 28;
      this.totalLine(doc, y, "Amount paid", this.inr(sale.amountPaid)); y += 22;
      this.totalLine(doc, y, "Pending amount", this.inr(sale.pendingAmount), new Decimal(sale.pendingAmount).gt(0));

      doc.moveDown(3);
      doc.fillColor("#5B564C").font("Helvetica").fontSize(9)
        .text("This invoice was generated from a confirmed Sornam AI sale. Weight, purity, rate, making charge, amount paid, GST and pending amount were confirmed before saving.", 44, doc.y, { width: 500 });

      doc.fillColor("#8A8478").fontSize(8).text("Computer generated invoice. No signature required for demo/local mode.", 44, 780, { align: "center", width: 507 });
      doc.end();
    });
  }

  private tableHeader(doc: PDFKit.PDFDocument, y: number) {
    doc.roundedRect(44, y, 507, 24, 6).fill("#F5F1E8");
    doc.fillColor("#1A1814").font("Helvetica-Bold").fontSize(8);
    ["#", "Item", "Weight", "Rate/g", "Making", "GST", "Total"].forEach((label, index) => {
      doc.text(label, [52, 78, 212, 282, 350, 412, 464][index], y + 8, { width: [20, 128, 62, 62, 54, 46, 78][index], align: index > 1 ? "right" : "left" });
    });
  }

  private tableRow(doc: PDFKit.PDFDocument, y: number, row: Record<string, string>) {
    doc.fillColor("#5B564C").font("Helvetica").fontSize(9);
    const values = [row.sno, row.item, row.weight, row.rate, row.making, row.gst, row.total];
    values.forEach((value, index) => {
      doc.text(value, [52, 78, 212, 282, 350, 412, 464][index], y + 6, { width: [20, 128, 62, 62, 54, 46, 78][index], align: index > 1 ? "right" : "left" });
    });
    doc.moveTo(44, y + 28).lineTo(551, y + 28).strokeColor("#EFE9DB").stroke();
  }

  private totalLine(doc: PDFKit.PDFDocument, y: number, label: string, value: string, strong = false) {
    doc.fillColor(strong ? "#1A1814" : "#5B564C").font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 12 : 10);
    doc.text(label, 340, y, { width: 100, align: "right" });
    doc.text(value, 456, y, { width: 95, align: "right" });
  }

  private inr(value: Decimal.Value) {
    return `Rs ${new Decimal(value).toFixed(2)}`;
  }

  private invoicePath(shopId: string, invoiceNumber: string) {
    return path.join(this.storageRoot(), "shops", shopId, "invoices", `${invoiceNumber}.pdf`);
  }

  private storageRoot() {
    return process.env.FILE_STORAGE_PATH ?? path.join(process.cwd(), "storage");
  }
}
