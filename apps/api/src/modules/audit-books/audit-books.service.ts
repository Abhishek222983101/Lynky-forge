import { Injectable } from "@nestjs/common";
import { AuditBookStatus, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AuditBookListQuery, AuditBookUpsertDto } from "./audit-books.schemas";

@Injectable()
export class AuditBooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  list(actor: AuthUser, query: AuditBookListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.auditBookEntry.findMany({
      where: { shopId, status: query.status },
      include: { sale: { include: { customer: true } }, invoice: true },
      orderBy: { updatedAt: "desc" },
      take: 500
    });
  }

  async upsert(actor: AuthUser, input: AuditBookUpsertDto) {
    const shopId = this.requireShop(actor);
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
    const sale = await this.prisma.sale.findFirst({ where: { id: input.saleId, shopId }, include: { invoice: true } });
    if (!sale) throw new AppError("Sale not found", 404);
    const invoiceId = input.invoiceId ?? sale.invoice?.id ?? null;
    const entry = await this.prisma.auditBookEntry.upsert({
      where: { saleId: sale.id },
      create: { shopId, saleId: sale.id, invoiceId, status: input.status, notes: input.notes ?? undefined, updatedBy: actor.id },
      update: { invoiceId, status: input.status, notes: input.notes ?? undefined, updatedBy: actor.id }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "audit_book_entry.updated", entityType: "audit_book_entry", entityId: entry.id, source: "audit_books_api", afterData: { saleId: entry.saleId, status: entry.status } });
    return entry;
  }

  async summary(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const entries = await this.prisma.auditBookEntry.findMany({ where: { shopId }, include: { sale: true } });
    const included = entries.filter((entry) => entry.status === AuditBookStatus.included);
    const excluded = entries.filter((entry) => entry.status === AuditBookStatus.excluded);
    return {
      totalEntries: entries.length,
      includedCount: included.length,
      excludedCount: excluded.length,
      includedValue: included.reduce((sum, entry) => sum.plus(entry.sale?.totalAmount ?? 0), new Decimal(0)).toString(),
      excludedValue: excluded.reduce((sum, entry) => sum.plus(entry.sale?.totalAmount ?? 0), new Decimal(0)).toString()
    };
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}
