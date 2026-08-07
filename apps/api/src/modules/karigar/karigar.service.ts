import { Injectable } from "@nestjs/common";
import { InventoryStatus, KarigarJobStatus, StockMovementType, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { EventsService } from "@/modules/integrations/events/events.service";
import { InventoryService } from "@/modules/inventory/inventory.service";
import { KarigarCreateDto, KarigarJobCreateDto, KarigarReturnCreateDto } from "./karigar.schemas";
import { calculateKarigarWastage } from "./wastage";

@Injectable()
export class KarigarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly inventory: InventoryService,
    private readonly events: EventsService
  ) {}

  async create(actor: AuthUser, input: KarigarCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWorkshopRole(actor);
    const karigar = await this.prisma.karigar.create({
      data: {
        shopId,
        name: input.name,
        phone: input.phone ?? undefined,
        specialization: input.specialization ?? undefined,
        notes: input.notes ?? undefined
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "karigar.created", entityType: "karigar", entityId: karigar.id, source: "karigar_api", afterData: { name: karigar.name } });
    return karigar;
  }

  list(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    return this.prisma.karigar.findMany({ where: { shopId, isActive: true }, orderBy: { name: "asc" } });
  }

  /** Flat, newest-first job list for the workshop desk: one row per job with the
   * karigar name and how much has come back so far, so the UI can show a table. */
  async listJobs(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const jobs = await this.prisma.karigarJob.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      include: { karigar: { select: { name: true } }, returns: { select: { finishedWeight: true, scrapWeight: true } } }
    });
    return jobs.map((job) => {
      const finished = job.returns.reduce((sum, row) => sum.plus(row.finishedWeight), new Decimal(0));
      const scrap = job.returns.reduce((sum, row) => sum.plus(row.scrapWeight), new Decimal(0));
      return {
        id: job.id,
        jobNumber: job.jobNumber,
        karigar: job.karigar.name,
        itemDescription: job.itemDescription,
        purity: job.purity,
        issuedWeight: job.issuedWeight,
        finishedWeight: finished.toFixed(3),
        scrapWeight: scrap.toFixed(3),
        status: job.status,
        issuedDate: job.issuedDate
      };
    });
  }

  async issueJob(actor: AuthUser, input: KarigarJobCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWorkshopRole(actor);
    return this.prisma.$transaction(async (tx) => {
      const karigar = await tx.karigar.findFirst({ where: { id: input.karigarId, shopId, isActive: true } });
      if (!karigar) throw new AppError("Karigar not found", 404);
      const item = input.inventoryItemId ? await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, shopId } }) : null;
      if (input.inventoryItemId) {
        if (!item) throw new AppError("Inventory item not found", 404);
        if (item.status !== InventoryStatus.available && item.status !== InventoryStatus.reserved) throw new AppError("Inventory item cannot be issued to workshop", 409);
      }
      const job = await tx.karigarJob.create({
        data: {
          shopId,
          karigarId: karigar.id,
          inventoryItemId: input.inventoryItemId ?? undefined,
          jobNumber: `KJ-${Date.now().toString(36).toUpperCase()}`,
          itemDescription: input.itemDescription,
          purity: input.purity,
          issuedWeight: input.issuedWeight,
          issuedDate: input.issuedDate ?? new Date(),
          dueDate: input.dueDate ?? undefined,
          createdBy: actor.id
        }
      });
      if (item) {
        await tx.inventoryItem.update({ where: { id: item.id }, data: { status: InventoryStatus.in_workshop } });
        await this.inventory.createMovementTx(tx, shopId, {
          inventoryItemId: item.id,
          movementType: StockMovementType.workshop_issue,
          quantity: 1,
          weight: input.issuedWeight,
          fromStatus: item.status,
          toStatus: InventoryStatus.in_workshop,
          referenceType: "karigar_job",
          referenceId: job.id,
          notes: `Issued to ${karigar.name}`,
          createdBy: actor.id
        });
      }
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "karigar_job.issued", entityType: "karigar_job", entityId: job.id, source: "karigar_api", afterData: { karigarId: karigar.id, issuedWeight: input.issuedWeight } });
      return job;
    });
  }

  async recordReturn(actor: AuthUser, jobId: string, input: KarigarReturnCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWorkshopRole(actor);
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.karigarJob.findFirst({ where: { id: jobId, shopId }, include: { returns: true, karigar: true, inventoryItem: true } });
      if (!job) throw new AppError("Karigar job not found", 404);
      if (job.status === KarigarJobStatus.returned || job.status === KarigarJobStatus.cancelled) throw new AppError("Karigar job is closed", 409);

      const previousFinished = job.returns.reduce((sum, row) => sum.plus(row.finishedWeight), new Decimal(0));
      const previousScrap = job.returns.reduce((sum, row) => sum.plus(row.scrapWeight), new Decimal(0));
      const cumulativeFinished = previousFinished.plus(input.finishedWeight);
      const cumulativeScrap = previousScrap.plus(input.scrapWeight);
      const issued = new Decimal(job.issuedWeight);
      if (cumulativeFinished.plus(cumulativeScrap).gt(issued)) throw new AppError("Returned weight exceeds issued weight", 422);

      const result = calculateKarigarWastage(issued, cumulativeFinished, cumulativeScrap);
      const wastageWeight = result.wastageWeight;
      const wastagePercent = result.wastagePercent;
      const flagged = result.flagged;
      const status = wastageWeight.eq(0) ? KarigarJobStatus.returned : KarigarJobStatus.partially_returned;

      const karigarReturn = await tx.karigarReturn.create({
        data: {
          shopId,
          karigarJobId: job.id,
          finishedWeight: input.finishedWeight,
          scrapWeight: input.scrapWeight,
          wastageWeight: wastageWeight.toFixed(3),
          wastagePercent: wastagePercent.toFixed(3),
          flagged,
          returnDate: input.returnDate ?? new Date(),
          notes: input.notes ?? undefined,
          createdBy: actor.id
        }
      });
      await tx.karigarJob.update({ where: { id: job.id }, data: { status } });
      if (job.inventoryItemId && status === KarigarJobStatus.returned) {
        await tx.inventoryItem.update({ where: { id: job.inventoryItemId }, data: { status: InventoryStatus.available } });
        await this.inventory.createMovementTx(tx, shopId, {
          inventoryItemId: job.inventoryItemId,
          movementType: StockMovementType.workshop_receive,
          quantity: 1,
          weight: cumulativeFinished.toString(),
          fromStatus: InventoryStatus.in_workshop,
          toStatus: InventoryStatus.available,
          referenceType: "karigar_return",
          referenceId: karigarReturn.id,
          notes: `Received from ${job.karigar.name}`,
          createdBy: actor.id
        });
      }
      if (flagged) {
        await this.events.publish(tx, shopId, "karigar.wastage_flagged", { shopId, karigarId: job.karigarId, jobId: job.id, returnId: karigarReturn.id, wastageWeight: wastageWeight.toFixed(3), wastagePercent: wastagePercent.toFixed(3) });
      }
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "karigar_return.created", entityType: "karigar_return", entityId: karigarReturn.id, source: "karigar_api", afterData: { jobId: job.id, wastageWeight: wastageWeight.toFixed(3), wastagePercent: wastagePercent.toFixed(3), flagged } });
      return karigarReturn;
    });
  }

  async scorecard(actor: AuthUser, karigarId: string) {
    const shopId = this.requireShop(actor);
    const karigar = await this.prisma.karigar.findFirst({
      where: { id: karigarId, shopId },
      include: { jobs: { include: { returns: true } } }
    });
    if (!karigar) throw new AppError("Karigar not found", 404);
    const totalIssued = karigar.jobs.reduce((sum, job) => sum.plus(job.issuedWeight), new Decimal(0));
    const returns = karigar.jobs.flatMap((job) => job.returns);
    const totalWastage = returns.reduce((sum, row) => sum.plus(row.wastageWeight), new Decimal(0));
    const avgWastagePercent = returns.length ? returns.reduce((sum, row) => sum.plus(row.wastagePercent), new Decimal(0)).div(returns.length) : new Decimal(0);
    return {
      karigar: { id: karigar.id, name: karigar.name, specialization: karigar.specialization },
      totalJobs: karigar.jobs.length,
      openJobs: karigar.jobs.filter((job) => job.status === KarigarJobStatus.open || job.status === KarigarJobStatus.partially_returned).length,
      totalIssuedWeight: totalIssued.toFixed(3),
      totalWastageWeight: totalWastage.toFixed(3),
      avgWastagePercent: avgWastagePercent.toFixed(3),
      flaggedReturns: returns.filter((row) => row.flagged).length
    };
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireWorkshopRole(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.workshop_manager && actor.role !== UserRole.admin) {
      throw new AppError("Insufficient permissions", 403);
    }
  }
}
