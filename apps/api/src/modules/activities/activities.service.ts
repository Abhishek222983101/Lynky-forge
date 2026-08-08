import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { CreateActivityDto } from "./activities.schemas";

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  /** Add a note/call/email log entry to a deal's timeline. */
  async createForDeal(dealId: string, input: CreateActivityDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, shopId }, select: { id: true, companyId: true } });
    if (!deal) throw new AppError("Deal not found", 404);

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          shopId,
          dealId,
          companyId: deal.companyId,
          type: input.type,
          description: input.description,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
          actorId: actor.id
        }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "activity.created",
        entityType: "activity",
        entityId: activity.id,
        source: "api",
        afterData: { dealId, type: activity.type }
      });
      return activity;
    });
  }

  /** Deal timeline — newest first. */
  async listForDeal(dealId: string, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, shopId }, select: { id: true } });
    if (!deal) throw new AppError("Deal not found", 404);
    return this.prisma.activity.findMany({
      where: { dealId, shopId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  /** Company-wide timeline (used by Company 360 activity tab). */
  async listForCompany(companyId: string, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const company = await this.prisma.company.findFirst({ where: { id: companyId, shopId }, select: { id: true } });
    if (!company) throw new AppError("Company not found", 404);
    return this.prisma.activity.findMany({
      where: { companyId, shopId },
      include: { deal: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}
