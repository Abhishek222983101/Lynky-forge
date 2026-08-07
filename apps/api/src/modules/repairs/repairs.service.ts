import { Injectable } from "@nestjs/common";
import { FollowUpType, RepairOrderStatus, UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { EventsService } from "@/modules/integrations/events/events.service";
import { RepairCreateDto, RepairListQuery, RepairStatusUpdateDto } from "./repairs.schemas";

@Injectable()
export class RepairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly events: EventsService
  ) {}

  async create(actor: AuthUser, input: RepairCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, shopId } });
      if (!customer) throw new AppError("Customer not found", 404);
      const order = await tx.repairOrder.create({
        data: {
          shopId,
          customerId: customer.id,
          orderNumber: `RP-${Date.now().toString(36).toUpperCase()}`,
          itemDescription: input.itemDescription,
          purity: input.purity ?? undefined,
          expectedDate: input.expectedDate ?? undefined,
          notes: input.notes ?? undefined,
          createdBy: actor.id
        }
      });
      await tx.repairStatusEvent.create({ data: { shopId, repairOrderId: order.id, status: order.status, notes: input.notes ?? undefined, createdBy: actor.id } });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "repair_order.created", entityType: "repair_order", entityId: order.id, source: "repairs_api", afterData: { customerId: order.customerId, orderNumber: order.orderNumber } });
      return order;
    });
  }

  list(actor: AuthUser, query: RepairListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.repairOrder.findMany({
      where: { shopId, customerId: query.customerId, status: query.status },
      include: { customer: true, statusEvents: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async get(actor: AuthUser, repairOrderId: string) {
    const shopId = this.requireShop(actor);
    const order = await this.prisma.repairOrder.findFirst({ where: { id: repairOrderId, shopId }, include: { customer: true, statusEvents: { orderBy: { createdAt: "asc" } } } });
    if (!order) throw new AppError("Repair order not found", 404);
    return order;
  }

  async updateStatus(actor: AuthUser, repairOrderId: string, input: RepairStatusUpdateDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.repairOrder.findFirst({ where: { id: repairOrderId, shopId } });
      if (!existing) throw new AppError("Repair order not found", 404);
      const order = await tx.repairOrder.update({ where: { id: existing.id }, data: { status: input.status } });
      await tx.repairStatusEvent.create({ data: { shopId, repairOrderId: order.id, status: input.status, notes: input.notes ?? undefined, createdBy: actor.id } });
      if (input.status === RepairOrderStatus.ready) {
        await tx.customerFollowUp.create({
          data: {
            shopId,
            customerId: order.customerId,
            type: FollowUpType.repair_ready,
            dueAt: new Date(),
            message: `Repair order ${order.orderNumber} is ready.`,
            createdBy: actor.id
          }
        });
        await this.events.publish(tx, shopId, "repair.ready", { shopId, repairOrderId: order.id, customerId: order.customerId });
      }
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "repair_order.status_updated", entityType: "repair_order", entityId: order.id, source: "repairs_api", beforeData: { status: existing.status }, afterData: { status: order.status } });
      return order;
    });
  }

  async summary(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const orders = await this.prisma.repairOrder.findMany({ where: { shopId } });
    return {
      total: orders.length,
      received: orders.filter((row) => row.status === RepairOrderStatus.received).length,
      inWorkshop: orders.filter((row) => row.status === RepairOrderStatus.in_workshop).length,
      ready: orders.filter((row) => row.status === RepairOrderStatus.ready).length,
      delivered: orders.filter((row) => row.status === RepairOrderStatus.delivered).length
    };
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireWrite(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.salesperson && actor.role !== UserRole.workshop_manager && actor.role !== UserRole.admin) {
      throw new AppError("Insufficient permissions", 403);
    }
  }
}
