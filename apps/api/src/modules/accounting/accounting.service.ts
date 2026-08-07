import { Injectable } from "@nestjs/common";
import { AccountingExportStatus, AccountingProvider, Prisma, UserRole } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AccountingExportCreateDto, AccountingExportListQuery } from "./accounting.schemas";
import { BusyExporter } from "./busy-exporter";
import { TallyExporter } from "./tally-exporter";
import { VyaparExporter } from "./vyapar-exporter";
import { ZohoBooksExporter } from "./zoho-books-exporter";

type TallyImportResult = {
  created: number;
  altered: number;
  deleted: number;
  combined: number;
  ignored: number;
  errors: number;
  cancelled: number;
  exceptions: number;
  lastVoucherId?: string;
  lastMasterId?: string;
  lineErrors: string[];
};

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async createExport(actor: AuthUser, input: AccountingExportCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    const pending = await this.prisma.accountingExport.create({
      data: {
        shopId,
        provider: input.provider,
        exportType: input.exportType,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        filters: { dateFrom: input.dateFrom?.toISOString() ?? null, dateTo: input.dateTo?.toISOString() ?? null } as Prisma.InputJsonValue,
        exportedBy: actor.id
      }
    });

    try {
      const shop = await this.prisma.shop.findFirst({ where: { id: shopId } });
      if (!shop) throw new AppError("Shop not found", 404);
      const tallyCompanyName = input.tallyCompanyName || shop.legalName || shop.name;
      const built = await this.buildExport(shopId, input, tallyCompanyName);
      const pushResult = input.provider === AccountingProvider.tally && input.pushToTally
        ? await this.pushToTally(input.tallyEndpointUrl, built.content)
        : null;
      if (input.provider === AccountingProvider.zoho_books && input.pushToZoho) {
        throw new AppError("Zoho Books push requires saved Zoho contact and item mappings. Generate the JSON export until mappings are configured.", 422);
      }
      const extension = this.fileExtension(input.provider);
      const fileName = `${input.provider}-${input.exportType}-${pending.id}.${extension}`;
      const absolutePath = await this.writeFile(shopId, fileName, built.content);
      const fileUrl = `/api/v1/accounting/exports/${pending.id}/download`;
      const exportRow = await this.prisma.accountingExport.update({
        where: { id: pending.id },
        data: {
          status: AccountingExportStatus.generated,
          fileName,
          fileUrl,
          recordCount: built.recordCount,
          filters: {
            dateFrom: input.dateFrom?.toISOString() ?? null,
            dateTo: input.dateTo?.toISOString() ?? null,
            tallyCompanyName: input.provider === AccountingProvider.tally ? tallyCompanyName : null,
            tallyPush: pushResult ? {
              endpointUrl: input.tallyEndpointUrl,
              status: pushResult.status,
              result: pushResult.result,
              responsePreview: pushResult.responseText.slice(0, 500)
            } : null
          } as Prisma.InputJsonValue,
          exportedAt: new Date()
        }
      });
      await this.audit.create(this.prisma, {
        shopId,
        actorUserId: actor.id,
        action: "accounting_export.generated",
        entityType: "accounting_export",
        entityId: exportRow.id,
        source: "accounting_api",
        afterData: { provider: exportRow.provider, exportType: exportRow.exportType, recordCount: exportRow.recordCount, fileName: path.basename(absolutePath) }
      });
      return exportRow;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Accounting export failed";
      const failed = await this.prisma.accountingExport.update({ where: { id: pending.id }, data: { status: AccountingExportStatus.failed, errorMessage: message } });
      await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "accounting_export.failed", entityType: "accounting_export", entityId: failed.id, source: "accounting_api", afterData: { provider: failed.provider, exportType: failed.exportType, errorMessage: message } });
      throw error;
    }
  }

  list(actor: AuthUser, query: AccountingExportListQuery) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    return this.prisma.accountingExport.findMany({
      where: { shopId, provider: query.provider, exportType: query.exportType },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getDownload(actor: AuthUser, exportId: string) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    const exportRow = await this.prisma.accountingExport.findFirst({ where: { id: exportId, shopId } });
    if (!exportRow) throw new AppError("Accounting export not found", 404);
    if (exportRow.status !== AccountingExportStatus.generated || !exportRow.fileName) throw new AppError("Accounting export is not ready", 409);
    const absolutePath = path.join(this.exportDir(shopId), exportRow.fileName);
    if (!fs.existsSync(absolutePath)) throw new AppError("Accounting export file is missing", 404);
    return { exportRow, absolutePath, contentType: this.contentType(exportRow.provider) };
  }

  private buildExport(shopId: string, input: AccountingExportCreateDto, tallyCompanyName: string) {
    if (input.provider === AccountingProvider.tally) {
      return new TallyExporter(this.prisma).build(shopId, input.exportType, { dateFrom: input.dateFrom, dateTo: input.dateTo, companyName: tallyCompanyName });
    }
    if (input.provider === AccountingProvider.vyapar) {
      return new VyaparExporter(this.prisma).build(shopId, input.exportType, input.dateFrom, input.dateTo);
    }
    if (input.provider === AccountingProvider.busy) {
      return new BusyExporter(this.prisma).build(shopId, input.exportType, input.dateFrom, input.dateTo);
    }
    if (input.provider === AccountingProvider.zoho_books) {
      return new ZohoBooksExporter(this.prisma).build(shopId, input.exportType, input.dateFrom, input.dateTo);
    }
    throw new AppError("Unsupported accounting provider", 422);
  }

  private fileExtension(provider: AccountingProvider) {
    if (provider === AccountingProvider.tally) return "xml";
    if (provider === AccountingProvider.zoho_books) return "json";
    return "csv";
  }

  private contentType(provider: AccountingProvider) {
    if (provider === AccountingProvider.tally) return "application/xml";
    if (provider === AccountingProvider.zoho_books) return "application/json";
    return "text/csv";
  }

  private async writeFile(shopId: string, fileName: string, content: string) {
    const dir = this.exportDir(shopId);
    await fs.promises.mkdir(dir, { recursive: true });
    const absolutePath = path.join(dir, fileName);
    await fs.promises.writeFile(absolutePath, content, "utf8");
    return absolutePath;
  }

  private async pushToTally(endpointUrl: string | undefined, xml: string) {
    if (!endpointUrl) throw new AppError("Tally endpoint URL is required when pushToTally is true", 422);
    const url = new URL(endpointUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new AppError("Tally endpoint must be an HTTP URL", 422);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml
    });
    const responseText = await response.text();
    const result = this.parseTallyImportResult(responseText);
    if (!response.ok || /<STATUS>\s*0\s*<\/STATUS>/i.test(responseText) || result.errors > 0 || result.exceptions > 0 || result.lineErrors.length > 0) {
      throw new AppError(`Tally import failed: ${responseText.slice(0, 500)}`, 502);
    }
    return { status: response.status, responseText, result };
  }

  private parseTallyImportResult(xml: string): TallyImportResult {
    return {
      created: this.xmlInt(xml, "CREATED"),
      altered: this.xmlInt(xml, "ALTERED"),
      deleted: this.xmlInt(xml, "DELETED"),
      combined: this.xmlInt(xml, "COMBINED"),
      ignored: this.xmlInt(xml, "IGNORED"),
      errors: this.xmlInt(xml, "ERRORS"),
      cancelled: this.xmlInt(xml, "CANCELLED"),
      exceptions: this.xmlInt(xml, "EXCEPTIONS"),
      lastVoucherId: this.xmlText(xml, "LASTVCHID"),
      lastMasterId: this.xmlText(xml, "LASTMID"),
      lineErrors: this.xmlTexts(xml, "LINEERROR")
    };
  }

  private xmlInt(xml: string, tag: string) {
    const value = this.xmlText(xml, tag);
    return value ? Number.parseInt(value, 10) || 0 : 0;
  }

  private xmlText(xml: string, tag: string) {
    return this.xmlTexts(xml, tag)[0];
  }

  private xmlTexts(xml: string, tag: string) {
    const matches = [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"))];
    return matches.map((match) => this.decodeXml(match[1].trim())).filter(Boolean);
  }

  private decodeXml(value: string) {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  private exportDir(shopId: string) {
    return path.join(this.storageRoot(), "shops", shopId, "accounting");
  }

  private storageRoot() {
    return process.env.FILE_STORAGE_PATH ?? path.join(process.cwd(), "storage");
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireOwner(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
  }
}
