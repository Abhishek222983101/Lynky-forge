import { Injectable } from "@nestjs/common";
import { FollowUpStatus, FollowUpType, SavingsSchemeStatus, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { SchemeCreateDto, SchemeInstallmentDto, SchemeListQuery, SchemeStatusDto } from "./schemes.schemas";

@Injectable()
export class SchemesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async create(actor: AuthUser, input: SchemeCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, shopId } });
    if (!customer) throw new AppError("Customer not found", 404);
    const maturityDate = input.maturityDate ?? this.addMonths(input.startDate, input.months);
    const scheme = await this.prisma.savingsScheme.create({
      data: {
        shopId,
        customerId: customer.id,
        schemeNumber: `SCH-${Date.now().toString(36).toUpperCase()}`,
        monthlyAmount: input.monthlyAmount,
        months: input.months,
        startDate: input.startDate,
        maturityDate,
        notes: input.notes ?? undefined,
        createdBy: actor.id
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "savings_scheme.created", entityType: "savings_scheme", entityId: scheme.id, source: "schemes_api", afterData: { customerId: scheme.customerId, monthlyAmount: scheme.monthlyAmount.toString(), months: scheme.months } });
    return scheme;
  }

  list(actor: AuthUser, query: SchemeListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.savingsScheme.findMany({
      where: { shopId, customerId: query.customerId, status: query.status },
      include: { customer: true, installments: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async get(actor: AuthUser, schemeId: string) {
    const shopId = this.requireShop(actor);
    const scheme = await this.prisma.savingsScheme.findFirst({ where: { id: schemeId, shopId }, include: { customer: true, installments: true } });
    if (!scheme) throw new AppError("Scheme not found", 404);
    return scheme;
  }

  async recordInstallment(actor: AuthUser, schemeId: string, input: SchemeInstallmentDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const scheme = await tx.savingsScheme.findFirst({ where: { id: schemeId, shopId }, include: { installments: true } });
      if (!scheme) throw new AppError("Scheme not found", 404);
      if (scheme.status !== SavingsSchemeStatus.active) throw new AppError("Scheme is not active", 409);
      const installment = await tx.schemeInstallment.create({
        data: {
          shopId,
          schemeId: scheme.id,
          amount: input.amount,
          paidAt: input.paidAt,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? undefined,
          createdBy: actor.id
        }
      });
      const paidCount = scheme.installments.length + 1;
      const totalPaid = scheme.installments.reduce((sum, row) => sum.plus(row.amount), new Decimal(input.amount));
      if (paidCount >= scheme.months || totalPaid.greaterThanOrEqualTo(new Decimal(scheme.monthlyAmount).mul(scheme.months))) {
        await tx.savingsScheme.update({ where: { id: scheme.id }, data: { status: SavingsSchemeStatus.matured } });
      }
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "scheme_installment.created", entityType: "scheme_installment", entityId: installment.id, source: "schemes_api", afterData: { schemeId: scheme.id, amount: installment.amount.toString() } });
      return installment;
    });
  }

  async updateStatus(actor: AuthUser, schemeId: string, input: SchemeStatusDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    const existing = await this.prisma.savingsScheme.findFirst({ where: { id: schemeId, shopId } });
    if (!existing) throw new AppError("Scheme not found", 404);
    const scheme = await this.prisma.savingsScheme.update({ where: { id: existing.id }, data: { status: input.status } });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "savings_scheme.status_updated", entityType: "savings_scheme", entityId: scheme.id, source: "schemes_api", beforeData: { status: existing.status }, afterData: { status: scheme.status } });
    return scheme;
  }

  async summary(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const schemes = await this.prisma.savingsScheme.findMany({ where: { shopId }, include: { installments: true } });
    return {
      totalSchemes: schemes.length,
      active: schemes.filter((scheme) => scheme.status === SavingsSchemeStatus.active).length,
      matured: schemes.filter((scheme) => scheme.status === SavingsSchemeStatus.matured).length,
      totalCommitted: schemes.reduce((sum, scheme) => sum.plus(new Decimal(scheme.monthlyAmount).mul(scheme.months)), new Decimal(0)).toString(),
      totalCollected: schemes.flatMap((scheme) => scheme.installments).reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toString()
    };
  }

  async generateDueFollowUps(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const until = new Date(today);
    until.setDate(until.getDate() + 7);
    const schemes = await this.prisma.savingsScheme.findMany({
      where: { shopId, status: SavingsSchemeStatus.active },
      include: { customer: true, installments: true }
    });
    let created = 0;
    const followUps = [];
    for (const scheme of schemes) {
      const paidCount = scheme.installments.length;
      if (paidCount >= scheme.months) continue;
      const dueAt = this.addMonths(scheme.startDate, paidCount + 1);
      dueAt.setHours(10, 0, 0, 0);
      if (dueAt < today || dueAt > until) continue;
      const existing = await this.prisma.customerFollowUp.findFirst({
        where: {
          shopId,
          customerId: scheme.customerId,
          type: FollowUpType.scheme_due,
          status: { in: [FollowUpStatus.due, FollowUpStatus.scheduled] },
          dueAt: { gte: today, lte: until },
          message: { contains: scheme.schemeNumber }
        }
      });
      if (existing) continue;
      const paidAmount = scheme.installments.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
      const followUp = await this.prisma.customerFollowUp.create({
        data: {
          shopId,
          customerId: scheme.customerId,
          type: FollowUpType.scheme_due,
          dueAt,
          message: `Scheme ${scheme.schemeNumber} installment of Rs ${new Decimal(scheme.monthlyAmount).toFixed(2)} is due. Balance collected so far: Rs ${paidAmount.toFixed(2)}.`,
          metadata: { schemeId: scheme.id, schemeNumber: scheme.schemeNumber, installmentNumber: paidCount + 1 },
          createdBy: actor.id
        }
      });
      followUps.push(followUp);
      created += 1;
    }
    await this.audit.create(this.prisma, {
      shopId,
      actorUserId: actor.id,
      action: "scheme_follow_ups.generated",
      entityType: "customer_follow_up",
      source: "schemes_api",
      afterData: { created }
    });
    return { created, followUps };
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
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
