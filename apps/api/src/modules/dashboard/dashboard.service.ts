import { Injectable } from "@nestjs/common";
import { DealStage, TaskStatus } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";

const OPEN_STAGES: DealStage[] = [DealStage.NEW_RFQ, DealStage.CONTACTED, DealStage.QUOTE_SENT, DealStage.NEGOTIATION];
const WIN_RATE_WINDOW_DAYS = 90;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One endpoint, everything the dashboard needs. All aggregates run in
   * parallel — logically a single round trip. Shape matches the Phase 3
   * dashboard UI one-to-one so the frontend does zero transformation.
   */
  async getDashboard(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    const shopId = actor.shopId;
    const now = new Date();
    const winRateSince = new Date(now.getTime() - WIN_RATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [pipeline, activeDeals, wonCount, lostCount, overdueTasks, dealsByStage, pipelineValueSeries, lossReasons, hotDeals, overdueTaskList] =
      await Promise.all([
        // Total value of open pipeline
        this.prisma.deal.aggregate({
          _sum: { value: true },
          where: { shopId, stage: { in: OPEN_STAGES } }
        }),
        // Number of open deals
        this.prisma.deal.count({ where: { shopId, stage: { in: OPEN_STAGES } } }),
        // Won in last 90 days (win-rate numerator)
        this.prisma.deal.count({ where: { shopId, stage: DealStage.WON, updatedAt: { gte: winRateSince } } }),
        // Lost in last 90 days (win-rate denominator pair)
        this.prisma.deal.count({ where: { shopId, stage: DealStage.LOST, updatedAt: { gte: winRateSince } } }),
        // Overdue follow-ups
        this.prisma.task.count({ where: { shopId, status: TaskStatus.DUE, dueAt: { lt: now } } }),
        // Kanban column counts
        this.prisma.deal.groupBy({ by: ["stage"], where: { shopId }, _count: { _all: true } }),
        // Precomputed 60-day pipeline series (populated by Phase 6 seed)
        this.prisma.dashboardSnapshot.findMany({ orderBy: { date: "asc" }, take: 60 }),
        // Top loss reasons
        this.prisma.deal.groupBy({
          by: ["lostReason"],
          where: { shopId, stage: DealStage.LOST, lostReason: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { lostReason: "desc" } },
          take: 3
        }),
        // Hot leads for the dashboard sidebar
        this.prisma.deal.findMany({
          where: { shopId, leadScore: "HOT", stage: { in: OPEN_STAGES } },
          select: { id: true, title: true, value: true, stage: true, company: { select: { name: true } } },
          orderBy: { value: "desc" },
          take: 5
        }),
        // Overdue task list (hazard-tinted section of dashboard)
        this.prisma.task.findMany({
          where: { shopId, status: TaskStatus.DUE, dueAt: { lt: now } },
          include: { deal: { select: { id: true, title: true } } },
          orderBy: { dueAt: "asc" },
          take: 10
        })
      ]);

    const decided = wonCount + lostCount;

    return {
      pipelineValue: pipeline._sum.value?.toString() ?? "0",
      activeDeals,
      winRate: decided === 0 ? null : wonCount / decided,
      wonDeals: wonCount,
      lostDeals: lostCount,
      overdueTasks,
      dealsByStage: dealsByStage.map((row) => ({ stage: row.stage, count: row._count._all })),
      pipelineValueSeries: pipelineValueSeries.map((snap) => ({
        date: snap.date.toISOString().slice(0, 10),
        pipelineValue: snap.pipelineValue.toString(),
        dealsOpen: snap.dealsOpen
      })),
      topLossReasons: lossReasons.map((row) => ({ reason: row.lostReason, count: row._count._all })),
      hotDeals: hotDeals.map((deal) => ({ ...deal, value: deal.value.toString() })),
      overdueTaskList
    };
  }
}
