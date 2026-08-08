import { Injectable } from "@nestjs/common";
import { ActivityType, DealStage, Prisma, QuoteStatus } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { money } from "@/common/utils/decimal";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AutomationsService } from "@/modules/automations/automations.service";
import { CreateQuoteDto, ListQuotesQueryDto, UpdateQuoteStatusDto, ApplyDraftDto } from "./quotes.schemas";

type Tx = Prisma.TransactionClient;

/** Transitions the state machine allows. Anything else → 400. */
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: [QuoteStatus.SENT],
  SENT: [QuoteStatus.ACCEPTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: []
};

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly automations: AutomationsService
  ) {}

  /**
   * Create a quote against a deal. Quote number auto-generates sequentially
   * per shop (Q-YYYY-NNNN). Total is computed server-side from line items —
   * never trusted from the client.
   */
  async create(input: CreateQuoteDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);

    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findFirst({ where: { id: input.dealId, shopId }, include: { quote: { select: { id: true } } } });
      if (!deal) throw new AppError("Deal not found", 404);
      if (deal.quote) throw new AppError("Deal already has a quote", 409);

      const totalAmount = input.lineItems.reduce((sum, item) => sum.add(money(item.qty).mul(money(item.unitPrice))), money(0));
      const quoteNo = await nextQuoteNo(tx, shopId);

      const quote = await tx.quote.create({
        data: {
          shopId,
          dealId: input.dealId,
          quoteNo,
          totalAmount,
          validUntil: input.validUntil,
          aiGenerated: input.aiGenerated,
          lineItems: input.lineItems as unknown as Prisma.InputJsonValue,
          terms: input.terms as unknown as Prisma.InputJsonValue
        }
      });

      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "quote.created",
        entityType: "quote",
        entityId: quote.id,
        source: "api",
        afterData: { dealId: input.dealId, quoteNo, totalAmount: totalAmount.toString(), aiGenerated: input.aiGenerated }
      });

      return quote;
    });
  }

  async list(query: ListQuotesQueryDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const where: Prisma.QuoteWhereInput = { shopId };
    if (query.status) where.status = query.status;
    const [total, quotes] = await Promise.all([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        include: {
          deal: { select: { id: true, title: true, stage: true, company: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      })
    ]);
    return { data: quotes, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const quote = await this.prisma.quote.findFirst({
      where: { id, shopId },
      include: {
        deal: {
          include: {
            company: true,
            contact: true,
            rfq: true
          }
        }
      }
    });
    if (!quote) throw new AppError("Quote not found", 404);
    return quote;
  }

  /**
   * Status transitions enforce a state machine. Marking SENT also advances
   * the deal to QUOTE_SENT (if still in an early stage) so the automation
   * engine fires the 3-day follow-up task — one transaction, no orphans.
   */
  async updateStatus(id: string, input: UpdateQuoteStatusDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, shopId },
        include: { deal: { select: { id: true, title: true, stage: true, value: true, companyId: true } } }
      });
      if (!quote) throw new AppError("Quote not found", 404);

      const allowed = ALLOWED_TRANSITIONS[quote.status];
      if (!allowed.includes(input.status)) {
        throw new AppError(`Cannot move quote from ${quote.status} to ${input.status}`, 400);
      }

      const updated = await tx.quote.update({ where: { id }, data: { status: input.status } });

      let tasksCreated: unknown[] = [];
      if (input.status === QuoteStatus.SENT) {
        await tx.activity.create({
          data: {
            shopId,
            dealId: quote.dealId,
            companyId: quote.deal.companyId,
            type: ActivityType.QUOTE_SENT,
            description: `Quote ${quote.quoteNo} marked as sent (₹${quote.totalAmount.toString()})`,
            metadata: { quoteId: quote.id, quoteNo: quote.quoteNo, totalAmount: quote.totalAmount.toString() },
            actorId: actor.id
          }
        });

        // Auto-advance the deal if it's still early-stage
        if (quote.deal.stage === DealStage.NEW_RFQ || quote.deal.stage === DealStage.CONTACTED) {
          const oldStage = quote.deal.stage;
          await tx.deal.update({ where: { id: quote.dealId }, data: { stage: DealStage.QUOTE_SENT } });
          await tx.activity.create({
            data: {
              shopId,
              dealId: quote.dealId,
              companyId: quote.deal.companyId,
              type: ActivityType.STAGE_CHANGE,
              description: `Stage changed: ${oldStage} → QUOTE_SENT (quote ${quote.quoteNo} sent)`,
              metadata: { from: oldStage, to: DealStage.QUOTE_SENT, via: "quote_sent" },
              actorId: actor.id
            }
          });
          const automationResult = await this.automations.runStageChange(tx, {
            shopId,
            dealId: quote.dealId,
            companyId: quote.deal.companyId,
            oldStage,
            newStage: DealStage.QUOTE_SENT,
            dealTitle: quote.deal.title,
            dealValue: quote.deal.value,
            quoteNo: quote.quoteNo,
            actorId: actor.id
          });
          tasksCreated = automationResult.tasksCreated;
        }
      }

      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "quote.status_changed",
        entityType: "quote",
        entityId: id,
        source: "api",
        beforeData: { status: quote.status },
        afterData: { status: input.status }
      });

      return { quote: updated, tasksCreated };
    });
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  /**
   * Apply AI-generated draft to an existing quote. Replaces line items, terms,
   * and recomputes totalAmount server-side. Only allowed on DRAFT or quotes
   * with aiGenerated=true (re-drafting).
   */
  async applyDraft(id: string, input: ApplyDraftDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, shopId },
        include: { deal: { select: { id: true, title: true, stage: true } } }
      });
      if (!quote) throw new AppError("Quote not found", 404);

      // Allow applying draft to DRAFT, SENT (re-draft before re-sending), or AI-generated quotes
      if (quote.status === QuoteStatus.ACCEPTED || quote.status === QuoteStatus.REJECTED) {
        throw new AppError("Cannot re-draft an accepted or rejected quote", 400);
      }

      const totalAmount = input.lineItems.reduce(
        (sum, item) => sum.add(money(item.qty).mul(money(item.unitPrice))),
        money(0)
      );

      const updated = await tx.quote.update({
        where: { id },
        data: {
          lineItems: input.lineItems as unknown as Prisma.InputJsonValue,
          terms: input.terms as unknown as Prisma.InputJsonValue,
          totalAmount,
          aiGenerated: true
        }
      });

      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "quote.draft_applied",
        entityType: "quote",
        entityId: id,
        source: "api",
        afterData: {
          quoteNo: quote.quoteNo,
          lineItems: input.lineItems.length,
          totalAmount: totalAmount.toString(),
          aiGenerated: true
        }
      });

      return updated;
    });
  }
}

/** Q-YYYY-NNNN, sequential per shop. Race-safe enough for a single-user demo. */
async function nextQuoteNo(tx: Tx, shopId: string): Promise<string> {
  const year = new Date().getFullYear();
  const last = await tx.quote.findFirst({
    where: { shopId, quoteNo: { startsWith: `Q-${year}-` } },
    orderBy: { quoteNo: "desc" },
    select: { quoteNo: true }
  });
  const lastSeq = last ? Number.parseInt(last.quoteNo.split("-")[2] ?? "0", 10) : 0;
  return `Q-${year}-${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, "0")}`;
}
