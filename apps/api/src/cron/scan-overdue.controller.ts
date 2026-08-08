import { Controller, Headers, HttpCode, Logger, Post } from "@nestjs/common";
import { TaskStatus, TaskType } from "@prisma/client";
import { env } from "@/common/config/env";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";

@Controller("cron")
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vercel Cron endpoint — runs hourly.
   * Scans for overdue tasks + NEW_RFQ deals >24h with no outreach.
   * Auth: Bearer CRON_SECRET header.
   */
  @Post("scan-overdue")
  @HttpCode(200)
  async scanOverdue(@Headers("authorization") auth: string | undefined) {
    this.assertCronAuth(auth);

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Count overdue tasks (dashboard computes live — this is diagnostic)
    const overdueCount = await this.prisma.task.count({
      where: { status: TaskStatus.DUE, dueAt: { lt: now } }
    });

    // 2. Find NEW_RFQ deals older than 24h with NO non-stage activity
    //    (no one has contacted the customer yet)
    const staleDeals = await this.prisma.deal.findMany({
      where: {
        stage: "NEW_RFQ",
        createdAt: { lt: staleThreshold },
        activities: {
          none: { type: { in: ["CALL", "EMAIL", "NOTE"] } }
        }
      },
      select: { id: true, title: true, shopId: true, companyId: true }
    });

    // 3. Auto-create "Initial outreach overdue" tasks for stale deals (idempotent)
    let tasksCreated = 0;
    for (const deal of staleDeals) {
      const existing = await this.prisma.task.findFirst({
        where: {
          dealId: deal.id,
          type: TaskType.CALL,
          autoCreated: true,
          message: { contains: "Initial outreach overdue" }
        }
      });
      if (existing) continue;

      await this.prisma.task.create({
        data: {
          shopId: deal.shopId,
          dealId: deal.id,
          companyId: deal.companyId,
          type: TaskType.CALL,
          status: TaskStatus.DUE,
          dueAt: now,
          message: `Initial outreach overdue — ${deal.title}`,
          autoCreated: true
        }
      });
      tasksCreated++;
    }

    this.logger.log(`Cron scan complete: ${overdueCount} overdue, ${staleDeals.length} stale deals, ${tasksCreated} tasks created`);

    return {
      scannedAt: now.toISOString(),
      overdueTasks: overdueCount,
      staleDeals: staleDeals.length,
      tasksCreated
    };
  }

  private assertCronAuth(auth: string | undefined) {
    if (!env.CRON_SECRET) return; // dev mode — no secret set
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      throw new AppError("Unauthorized", 401);
    }
  }
}
