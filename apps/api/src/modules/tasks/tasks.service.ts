import { Injectable } from "@nestjs/common";
import { Prisma, TaskStatus } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { CreateTaskDto, ListTasksQueryDto, UpdateTaskStatusDto } from "./tasks.schemas";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async create(input: CreateTaskDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    if (input.dealId) {
      const deal = await this.prisma.deal.findFirst({ where: { id: input.dealId, shopId }, select: { id: true } });
      if (!deal) throw new AppError("Deal not found", 404);
    }
    if (input.companyId) {
      const company = await this.prisma.company.findFirst({ where: { id: input.companyId, shopId }, select: { id: true } });
      if (!company) throw new AppError("Company not found", 404);
    }
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          shopId,
          dealId: input.dealId,
          companyId: input.companyId,
          type: input.type,
          dueAt: input.dueAt,
          message: input.message,
          createdBy: actor.id
        }
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "task.created",
        entityType: "task",
        entityId: task.id,
        source: "api",
        afterData: { type: task.type, dueAt: task.dueAt.toISOString(), dealId: task.dealId }
      });
      return task;
    });
  }

  async list(query: ListTasksQueryDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const where: Prisma.TaskWhereInput = { shopId };
    if (query.status) where.status = query.status;
    if (query.dealId) where.dealId = query.dealId;
    if (query.companyId) where.companyId = query.companyId;
    if (query.overdue) {
      where.status = TaskStatus.DUE;
      where.dueAt = { lt: new Date() };
    }
    const [total, tasks] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        include: {
          deal: { select: { id: true, title: true, stage: true } },
          company: { select: { id: true, name: true } }
        },
        orderBy: { dueAt: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      })
    ]);
    return { data: tasks, total, page: query.page, limit: query.limit };
  }

  async updateStatus(id: string, input: UpdateTaskStatusDto, actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const existing = await this.prisma.task.findFirst({ where: { id, shopId } });
    if (!existing) throw new AppError("Task not found", 404);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({ where: { id }, data: { status: input.status } });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "task.status_changed",
        entityType: "task",
        entityId: id,
        source: "api",
        beforeData: { status: existing.status },
        afterData: { status: input.status }
      });
      return task;
    });
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}
