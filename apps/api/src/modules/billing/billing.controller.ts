import { Controller, Get, Header, Param, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import fs from "node:fs";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { AppError } from "@/common/errors/app-error";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { InvoicePdfService } from "./invoice-pdf.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly invoicePdf: InvoicePdfService) {}

  @Post("invoices/:invoiceId/pdf")
  generateInvoicePdf(@Param("invoiceId") invoiceId: string, @CurrentUser() user: AuthUser) {
    if (!user.shopId) throw new AppError("Shop context required", 400);
    return this.invoicePdf.generate(invoiceId, user.shopId);
  }

  @Get("invoices/:invoiceId/pdf")
  @Header("Content-Type", "application/pdf")
  async downloadInvoicePdf(@Param("invoiceId") invoiceId: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    if (!user.shopId) throw new AppError("Shop context required", 400);
    const { invoice, absolutePath } = await this.invoicePdf.getPdf(invoiceId, user.shopId);
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
    fs.createReadStream(absolutePath).pipe(res);
  }
}
