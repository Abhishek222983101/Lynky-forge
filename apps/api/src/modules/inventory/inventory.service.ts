import { Injectable } from "@nestjs/common";
import { InventoryStatus, Prisma, StockMovementType, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { InventoryItemCreateDto, InventoryListQuery, InventoryStatusUpdateDto, SlowStockQuery, StockMovementCreateDto } from "./inventory.schemas";

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async createItem(actor: AuthUser, input: InventoryItemCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireStockWriteRole(actor);
    const item = await this.prisma.inventoryItem.create({
      data: {
        shopId,
        sku: input.sku ?? undefined,
        name: input.name,
        category: input.category ?? undefined,
        purity: input.purity,
        huidNumber: input.huidNumber ?? undefined,
        grossWeight: input.grossWeight ?? undefined,
        netWeight: input.netWeight ?? undefined,
        estimatedValue: input.estimatedValue ?? undefined,
        acquisitionDate: input.acquisitionDate ?? undefined,
        location: input.location ?? undefined,
        photoUrl: input.photoUrl ?? undefined,
        status: input.status ?? InventoryStatus.available
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "inventory_item.created", entityType: "inventory_item", entityId: item.id, source: "inventory_api", afterData: { name: item.name, status: item.status } });
    return item;
  }

  listItems(actor: AuthUser, query: InventoryListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.inventoryItem.findMany({
      where: {
        shopId,
        status: query.status,
        category: query.category,
        purity: query.purity,
        OR: query.q ? [
          { name: { contains: query.q, mode: "insensitive" } },
          { sku: { contains: query.q, mode: "insensitive" } },
          { huidNumber: { contains: query.q, mode: "insensitive" } }
        ] : undefined
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async getItem(actor: AuthUser, itemId: string) {
    const shopId = this.requireShop(actor);
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: itemId, shopId } });
    if (!item) throw new AppError("Inventory item not found", 404);
    return item;
  }

  async updateStatus(actor: AuthUser, itemId: string, input: InventoryStatusUpdateDto) {
    const shopId = this.requireShop(actor);
    this.requireStockWriteRole(actor);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, shopId } });
      if (!item) throw new AppError("Inventory item not found", 404);
      const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { status: input.status } });
      await this.createMovementTx(tx, shopId, {
        inventoryItemId: item.id,
        movementType: this.statusMovement(item.status, input.status),
        quantity: 1,
        weight: updated.netWeight?.toString() ?? updated.grossWeight?.toString() ?? null,
        fromStatus: item.status,
        toStatus: input.status,
        referenceType: "inventory_item",
        referenceId: item.id,
        notes: input.notes ?? null,
        createdBy: actor.id
      });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "inventory_item.status_updated", entityType: "inventory_item", entityId: item.id, source: "inventory_api", beforeData: { status: item.status }, afterData: { status: input.status } });
      return updated;
    });
  }

  async recordMovement(actor: AuthUser, input: StockMovementCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireStockWriteRole(actor);
    return this.prisma.$transaction(async (tx) => {
      let fromStatus: InventoryStatus | null = null;
      if (input.inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, shopId } });
        if (!item) throw new AppError("Inventory item not found", 404);
        fromStatus = item.status;
        if (input.toStatus) await tx.inventoryItem.update({ where: { id: item.id }, data: { status: input.toStatus } });
      }
      const movement = await this.createMovementTx(tx, shopId, { ...input, fromStatus, createdBy: actor.id });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "stock_movement.created", entityType: "stock_movement", entityId: movement.id, source: "inventory_api", afterData: { movementType: movement.movementType, inventoryItemId: movement.inventoryItemId } });
      return movement;
    });
  }

  listMovements(actor: AuthUser, inventoryItemId?: string) {
    const shopId = this.requireShop(actor);
    return this.prisma.stockMovement.findMany({
      where: { shopId, inventoryItemId },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async summary(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const items = await this.prisma.inventoryItem.findMany({ where: { shopId } });
    const byStatus = this.groupCount(items, "status");
    const byPurity = this.groupCount(items, "purity");
    const totalEstimatedValue = items.reduce((sum, item) => sum.plus(item.estimatedValue ?? 0), new Decimal(0));
    return { totalItems: items.length, byStatus, byPurity, totalEstimatedValue: totalEstimatedValue.toString() };
  }

  async slowStock(actor: AuthUser, query: SlowStockQuery) {
    const shopId = this.requireShop(actor);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - query.olderThanDays);
    const items = await this.prisma.inventoryItem.findMany({
      where: { shopId, status: InventoryStatus.available, acquisitionDate: { lte: cutoff } },
      orderBy: { acquisitionDate: "asc" }
    });
    const stuckValue = items.reduce((sum, item) => sum.plus(item.estimatedValue ?? 0), new Decimal(0));
    return { olderThanDays: query.olderThanDays, count: items.length, stuckValue: stuckValue.toString(), items };
  }

  async applySaleConfirmed(tx: Prisma.TransactionClient, shopId: string, actorId: string, saleId: string, items: Array<{ inventoryItemId?: string | null; netWeight?: string }>) {
    for (const item of items) {
      if (!item.inventoryItemId) continue;
      const inventoryItem = await tx.inventoryItem.findFirst({ where: { id: item.inventoryItemId, shopId } });
      if (!inventoryItem) throw new AppError("Inventory item not found for sale", 404);
      if (inventoryItem.status === InventoryStatus.sold || inventoryItem.status === InventoryStatus.inactive) {
        throw new AppError(`Inventory item ${inventoryItem.name} is not available for sale`, 409);
      }
      await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { status: InventoryStatus.sold } });
      await this.createMovementTx(tx, shopId, {
        inventoryItemId: inventoryItem.id,
        movementType: StockMovementType.sale,
        quantity: 1,
        weight: item.netWeight ?? inventoryItem.netWeight?.toString() ?? inventoryItem.grossWeight?.toString() ?? null,
        fromStatus: inventoryItem.status,
        toStatus: InventoryStatus.sold,
        referenceType: "sale",
        referenceId: saleId,
        notes: "Created from confirmed sale",
        createdBy: actorId
      });
    }
  }

  async createMovementTx(tx: Prisma.TransactionClient, shopId: string, input: {
    inventoryItemId?: string | null;
    movementType: StockMovementType;
    quantity?: number;
    weight?: string | null;
    fromStatus?: InventoryStatus | null;
    toStatus?: InventoryStatus | null;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
    createdBy?: string | null;
  }) {
    return tx.stockMovement.create({
      data: {
        shopId,
        inventoryItemId: input.inventoryItemId ?? undefined,
        movementType: input.movementType,
        quantity: input.quantity ?? 1,
        weight: input.weight ?? undefined,
        fromStatus: input.fromStatus ?? undefined,
        toStatus: input.toStatus ?? undefined,
        referenceType: input.referenceType ?? undefined,
        referenceId: input.referenceId ?? undefined,
        notes: input.notes ?? undefined,
        createdBy: input.createdBy ?? undefined
      }
    });
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireStockWriteRole(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.workshop_manager && actor.role !== UserRole.admin) {
      throw new AppError("Insufficient permissions", 403);
    }
  }

  private statusMovement(from: InventoryStatus, to: InventoryStatus) {
    if (to === InventoryStatus.reserved) return StockMovementType.reserve;
    if (from === InventoryStatus.reserved && to === InventoryStatus.available) return StockMovementType.unreserve;
    if (to === InventoryStatus.sold) return StockMovementType.sale;
    if (to === InventoryStatus.in_workshop) return StockMovementType.workshop_issue;
    if (from === InventoryStatus.in_workshop && to === InventoryStatus.available) return StockMovementType.workshop_receive;
    return StockMovementType.adjustment;
  }

  private groupCount<T extends Record<string, unknown>>(items: T[], key: keyof T) {
    return items.reduce<Record<string, number>>((acc, item) => {
      const value = String(item[key] ?? "unknown");
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  }
}
