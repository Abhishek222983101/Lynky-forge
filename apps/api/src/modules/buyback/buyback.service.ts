import { Injectable } from "@nestjs/common";
import { BuybackItemStatus, UserRole } from "@prisma/client";
import Decimal from "decimal.js";
import { money } from "@/common/utils/decimal";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AssignItemsDto, BuybackBundleCreateDto, BuybackItemCreateDto, BuybackListQuery } from "./buyback.schemas";

@Injectable()
export class BuybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async recordItem(actor: AuthUser, input: BuybackItemCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    if (input.customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, shopId } });
      if (!customer) throw new AppError("Customer not found", 404);
    }
    const calculatedValue = money(new Decimal(input.weight).mul(input.ratePerGram));
    const mismatchAmount = input.expectedValue ? money(calculatedValue.minus(input.expectedValue)) : null;
    const status = mismatchAmount && mismatchAmount.abs().greaterThan(1) ? BuybackItemStatus.flagged : BuybackItemStatus.recorded;
    const item = await this.prisma.buybackItem.create({
      data: {
        shopId,
        customerId: input.customerId ?? undefined,
        itemName: input.itemName,
        testedPurity: input.testedPurity,
        assignedPurity: input.assignedPurity ?? undefined,
        weight: input.weight,
        ratePerGram: input.ratePerGram,
        calculatedValue: calculatedValue.toString(),
        expectedValue: input.expectedValue ?? undefined,
        mismatchAmount: mismatchAmount?.toString(),
        status,
        testingFormUrl: input.testingFormUrl ?? undefined,
        notes: input.notes ?? undefined,
        createdBy: actor.id
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "buyback_item.recorded", entityType: "buyback_item", entityId: item.id, source: "buyback_api", afterData: { itemName: item.itemName, weight: item.weight.toString(), calculatedValue: item.calculatedValue.toString(), status: item.status } });
    return item;
  }

  listItems(actor: AuthUser, query: BuybackListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.buybackItem.findMany({
      where: { shopId, customerId: query.customerId, status: query.status },
      include: { customer: true, bundle: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async createBundle(actor: AuthUser, input: BuybackBundleCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const items = input.itemIds.length ? await tx.buybackItem.findMany({ where: { shopId, id: { in: input.itemIds }, bundleId: null } }) : [];
      if (items.length !== input.itemIds.length) throw new AppError("One or more buyback items are unavailable", 422);
      const totalWeight = items.reduce((sum, item) => sum.plus(item.weight), new Decimal(0));
      const totalValue = items.reduce((sum, item) => sum.plus(item.calculatedValue), new Decimal(0));
      const bundle = await tx.buybackBundle.create({
        data: {
          shopId,
          bundleNumber: `BB-${Date.now().toString(36).toUpperCase()}`,
          metal: input.metal,
          purity: input.purity,
          ratePerGram: input.ratePerGram,
          totalWeight: totalWeight.toString(),
          totalValue: totalValue.toString(),
          createdBy: actor.id
        }
      });
      if (items.length) {
        await tx.buybackItem.updateMany({ where: { shopId, id: { in: items.map((item) => item.id) } }, data: { bundleId: bundle.id, status: BuybackItemStatus.bundled } });
      }
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "buyback_bundle.created", entityType: "buyback_bundle", entityId: bundle.id, source: "buyback_api", afterData: { bundleNumber: bundle.bundleNumber, totalWeight: bundle.totalWeight.toString(), totalValue: bundle.totalValue.toString() } });
      return tx.buybackBundle.findUnique({ where: { id: bundle.id }, include: { items: true } });
    });
  }

  listBundles(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    return this.prisma.buybackBundle.findMany({ where: { shopId }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  async assignItems(actor: AuthUser, bundleId: string, input: AssignItemsDto) {
    const shopId = this.requireShop(actor);
    this.requireWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.buybackBundle.findFirst({ where: { id: bundleId, shopId } });
      if (!bundle) throw new AppError("Buyback bundle not found", 404);
      const items = await tx.buybackItem.findMany({ where: { shopId, id: { in: input.itemIds }, bundleId: null } });
      if (items.length !== input.itemIds.length) throw new AppError("One or more buyback items are unavailable", 422);
      await tx.buybackItem.updateMany({ where: { shopId, id: { in: items.map((item) => item.id) } }, data: { bundleId: bundle.id, status: BuybackItemStatus.bundled } });
      const allItems = await tx.buybackItem.findMany({ where: { shopId, bundleId: bundle.id } });
      const totalWeight = allItems.reduce((sum, item) => sum.plus(item.weight), new Decimal(0));
      const totalValue = allItems.reduce((sum, item) => sum.plus(item.calculatedValue), new Decimal(0));
      return tx.buybackBundle.update({ where: { id: bundle.id }, data: { totalWeight: totalWeight.toString(), totalValue: totalValue.toString() }, include: { items: true } });
    });
  }

  async summary(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const items = await this.prisma.buybackItem.findMany({ where: { shopId } });
    return {
      itemCount: items.length,
      totalWeight: items.reduce((sum, item) => sum.plus(item.weight), new Decimal(0)).toString(),
      totalValue: items.reduce((sum, item) => sum.plus(item.calculatedValue), new Decimal(0)).toString(),
      flagged: items.filter((item) => item.status === BuybackItemStatus.flagged).length
    };
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireWrite(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.salesperson && actor.role !== UserRole.admin) {
      throw new AppError("Insufficient permissions", 403);
    }
  }
}
