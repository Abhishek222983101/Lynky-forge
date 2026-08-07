import { Body, Controller, Get, Header, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import fs from "node:fs";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { AccountingService } from "./accounting.service";
import { accountingExportCreateSchema, accountingExportListQuerySchema, AccountingExportCreateDto, AccountingExportListQuery } from "./accounting.schemas";

@Controller("accounting")
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Post("exports")
  createExport(@Body(new ZodValidationPipe(accountingExportCreateSchema)) body: AccountingExportCreateDto, @CurrentUser() user: AuthUser) {
    return this.accounting.createExport(user, body);
  }

  @Get("exports")
  list(@Query(new ZodValidationPipe(accountingExportListQuerySchema)) query: AccountingExportListQuery, @CurrentUser() user: AuthUser) {
    return this.accounting.list(user, query);
  }

  @Get("exports/:exportId/download")
  @Header("Cache-Control", "private, max-age=0, no-cache")
  async download(@Param("exportId") exportId: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { exportRow, absolutePath, contentType } = await this.accounting.getDownload(user, exportId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${exportRow.fileName}"`);
    fs.createReadStream(absolutePath).pipe(res);
  }
}
