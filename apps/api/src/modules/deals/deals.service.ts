import { Injectable } from "@nestjs/common";
import { ActivityType, DealStage, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AutomationsService } from "@/modules/automations/automations.service";
import { CreateDealDto, ListDealsQueryDto, StageMoveDto, UpdateDealDto } from "./deals.schemas";

const TERMINAL_STAGES: DealStage[] = [DealStage.WON, DealStage.LOST];

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly automations: AutomationsService
  ) {}

  async create(input: CreateDealDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const company = await this.prisma.company.findFirst({ where: { id: input.companyId, shopId }, select: { id: true } });
    if (!company) throw new AppError("Company not found", 404);
    if (input.contactId) {
      const contact = await this.prisma.contact.findFirst({ where: { id: input.contactId, shopId }, select: { id: true } });
      if (!contact) throw new AppError("Contact not found", 404);
    }
    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          shopId,
          title: input.title,
          companyId: input.companyId,
          contactId: input.contactId,
          value: input.value,
          expectedClose: input.expectedClose,
          source: input.source,
          leadScore: input.leadScore
        }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "deal.created",
        entityType: "deal",
        entityId: deal.id,
        source: "api",
        afterData: { title: deal.title, value: deal.value.toString(), stage: deal.stage }
      });
      return deal;
    });
  }

  async list(query: ListDealsQueryDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const where: Prisma.DealWhereInput = { shopId };
    if (query.stage) where.stage = query.stage;
    if (query.companyId) where.companyId = query.companyId;

    const [total, deals] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, industry: true } },
          contact: { select: { id: true, name: true } },
          quote: { select: { id: true, quoteNo: true, status: true } },
          tasks: { where: { status: "DUE" }, select: { id: true, dueAt: true, type: true }, orderBy: { dueAt: "asc" }, take: 1 }
        },
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      })
    ]);
    return { data: deals, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const deal = await this.prisma.deal.findFirst({
      where: { id, shopId },
      include: {
        company: true,
        contact: true,
        rfq: true,
        quote: true,
        order: true,
        tasks: { orderBy: { dueAt: "asc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 50 }
      }
    });
    if (!deal) throw new AppError("Deal not found", 404);
    return deal;
  }

  async update(id: string, input: UpdateDealDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    await this.ensureExists(id, shopId);
    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.update({
        where: { id },
        data: {
          title: input.title,
          contactId: input.contactId,
          value: input.value,
          expectedClose: input.expectedClose,
          source: input.source,
          leadScore: input.leadScore
        }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "deal.updated",
        entityType: "deal",
        entityId: deal.id,
        source: "api",
        afterData: { title: deal.title, value: deal.value.toString() }
      });
      return deal;
    });
  }

  /**
   * The critical endpoint. Kanban drag-drop lands here.
   *
   * Everything happens inside one $transaction so the stage change, its
   * activity-log entry, and any automation side effects (follow-up task on
   * QUOTE_SENT, order on WON) commit atomically — a partial failure rolls
   * the whole thing back.
   */
  async moveStage(id: string, input: StageMoveDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch current state (need oldStage + quote for automation context)
      const deal = await tx.deal.findFirst({
        where: { id, shopId },
        include: { quote: { select: { quoteNo: true } } }
      });
      if (!deal) throw new AppError("Deal not found", 404);

      const oldStage = deal.stage;

      // 2. Validate the transition
      if (oldStage === input.stage) throw new AppError(`Deal is already in stage ${input.stage}`, 400);
      if (TERMINAL_STAGES.includes(oldStage)) {
        throw new AppError(`Deal is already ${oldStage} and cannot be moved`, 400);
      }
      if (input.stage === DealStage.LOST && !input.lostReason) {
        throw new AppError("lostReason is required when moving a deal to LOST", 400);
      }

      // 3. Update the deal
      const updated = await tx.deal.update({
        where: { id },
        data: {
          stage: input.stage,
          lostReason: input.stage === DealStage.LOST ? input.lostReason : null
        }
      });

      // 4. Activity log — stage change is always recorded
      const activity = await tx.activity.create({
        data: {
          shopId,
          dealId: id,
          companyId: deal.companyId,
          type: ActivityType.STAGE_CHANGE,
          description: `Stage changed: ${oldStage} → ${input.stage}`,
          metadata: { from: oldStage, to: input.stage, lostReason: input.lostReason ?? null },
          actorId: actor.id
        }
      });

      // 5. Automation side effects, synchronously, same transaction
      const automationResult = await this.automations.runStageChange(tx, {
        shopId,
        dealId: id,
        companyId: deal.companyId,
        oldStage,
        newStage: input.stage,
        dealTitle: deal.title,
        dealValue: deal.value,
        quoteNo: deal.quote?.quoteNo ?? null,
        actorId: actor.id
      });

      // 6. Audit trail
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "deal.stage_changed",
        entityType: "deal",
        entityId: id,
        source: "api",
        beforeData: { stage: oldStage },
        afterData: {
          stage: input.stage,
          lostReason: input.lostReason ?? null,
          tasksCreated: automationResult.tasksCreated.length,
          orderCreated: automationResult.order ? automationResult.order.orderNo : null
        }
      });

      return {
        deal: updated,
        order: automationResult.order,
        activity,
        tasksCreated: automationResult.tasksCreated
      };
    });
  }

  private async ensureExists(id: string, shopId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, shopId }, select: { id: true } });
    if (!deal) throw new AppError("Deal not found", 404);
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}
