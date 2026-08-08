import { Injectable } from "@nestjs/common";
import { ActivityType, DealStage, Order, OrderStatus, Prisma, Task, TaskStatus, TaskType } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type StageChangeContext = {
  shopId: string;
  dealId: string;
  companyId: string;
  oldStage: DealStage;
  newStage: DealStage;
  dealTitle: string;
  dealValue: Prisma.Decimal;
  quoteNo?: string | null;
  actorId: string;
};

export type StageChangeResult = {
  order: Order | null;
  tasksCreated: Task[];
};

const FOLLOW_UP_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const IDEMPOTENCY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AutomationsService {
  /**
   * Runs post-stage-change side effects synchronously inside the caller's
   * Prisma $transaction. Never call this outside a transaction — the whole
   * point is that deal update + activity + tasks + order commit atomically.
   */
  async runStageChange(tx: Tx, ctx: StageChangeContext): Promise<StageChangeResult> {
    const result: StageChangeResult = { order: null, tasksCreated: [] };

    switch (ctx.newStage) {
      case DealStage.QUOTE_SENT: {
        const task = await this.createQuoteFollowUpTask(tx, ctx);
        if (task) result.tasksCreated.push(task);
        break;
      }
      case DealStage.WON: {
        result.order = await this.createOrderForWonDeal(tx, ctx);
        await tx.activity.create({
          data: {
            shopId: ctx.shopId,
            dealId: ctx.dealId,
            companyId: ctx.companyId,
            type: ActivityType.DEAL_WON,
            description: `Deal won — order ${result.order.orderNo} created`,
            metadata: { orderId: result.order.id, orderNo: result.order.orderNo },
            actorId: ctx.actorId
          }
        });
        break;
      }
      case DealStage.LOST: {
        await tx.activity.create({
          data: {
            shopId: ctx.shopId,
            dealId: ctx.dealId,
            companyId: ctx.companyId,
            type: ActivityType.DEAL_LOST,
            description: "Deal marked as lost",
            actorId: ctx.actorId
          }
        });
        break;
      }
      default:
        // NEW_RFQ / CONTACTED / NEGOTIATION — no entry automations.
        // (24h-no-contact rules are handled by the Vercel Cron scan in Phase 5.)
        break;
    }

    return result;
  }

  /**
   * QUOTE_SENT → auto-create a follow-up task due in 3 days.
   * Idempotent: skips if an identical auto-task was created in the last hour.
   */
  private async createQuoteFollowUpTask(tx: Tx, ctx: StageChangeContext): Promise<Task | null> {
    const recent = await tx.task.findFirst({
      where: {
        dealId: ctx.dealId,
        type: TaskType.FOLLOW_UP,
        autoCreated: true,
        createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) }
      }
    });
    if (recent) return null;

    const quoteRef = ctx.quoteNo ? ` on quote ${ctx.quoteNo}` : " on the quote";
    return tx.task.create({
      data: {
        shopId: ctx.shopId,
        dealId: ctx.dealId,
        companyId: ctx.companyId,
        type: TaskType.FOLLOW_UP,
        status: TaskStatus.DUE,
        dueAt: new Date(Date.now() + FOLLOW_UP_DELAY_MS),
        message: `Follow up${quoteRef} — ${ctx.dealTitle}`,
        autoCreated: true,
        createdBy: ctx.actorId
      }
    });
  }

  /**
   * WON → convert deal to a production order. Order number is sequential
   * per shop (ORD-YYYY-NNNN), matching the quote numbering convention.
   */
  private async createOrderForWonDeal(tx: Tx, ctx: StageChangeContext): Promise<Order> {
    const existing = await tx.order.findUnique({ where: { dealId: ctx.dealId } });
    if (existing) return existing;

    const orderNo = await nextOrderNo(tx, ctx.shopId);
    return tx.order.create({
      data: {
        shopId: ctx.shopId,
        dealId: ctx.dealId,
        orderNo,
        totalAmount: ctx.dealValue,
        status: OrderStatus.PENDING
      }
    });
  }
}

/** Sequential numbering shared by quotes and orders: PREFIX-YYYY-NNNN per shop. */
export async function nextOrderNo(tx: Tx, shopId: string): Promise<string> {
  const year = new Date().getFullYear();
  const last = await tx.order.findFirst({
    where: { shopId, orderNo: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true }
  });
  const lastSeq = last ? Number.parseInt(last.orderNo.split("-")[2] ?? "0", 10) : 0;
  return `ORD-${year}-${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, "0")}`;
}
