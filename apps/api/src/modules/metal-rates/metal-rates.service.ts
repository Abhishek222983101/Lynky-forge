import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { GoldRateClient } from "@/modules/integrations/gold-rate/gold-rate.client";
import { MetalRateCreateDto, MetalRateFetchDto } from "./metal-rates.schemas";

@Injectable()
export class MetalRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goldRate: GoldRateClient,
    private readonly audit: AuditLogsService
  ) {}

  async create(actor: AuthUser, input: MetalRateCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    const rate = await this.prisma.metalRate.create({
      data: {
        shopId,
        metal: input.metal,
        purity: input.purity ?? undefined,
        ratePerUnit: input.ratePerUnit,
        unit: input.unit,
        source: input.source,
        fetchedAt: input.fetchedAt
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "metal_rate.created", entityType: "metal_rate", entityId: rate.id, source: "metal_rates_api", afterData: { metal: rate.metal, purity: rate.purity, ratePerUnit: rate.ratePerUnit.toString() } });
    return rate;
  }

  list(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    return this.prisma.metalRate.findMany({ where: { OR: [{ shopId }, { shopId: null }] }, orderBy: { fetchedAt: "desc" }, take: 100 });
  }

  /** Current live gold rates for the common karats, read-only (no DB write), for
   * the dashboard ticker. Skips any purity the feed cannot price right now. */
  async liveRates(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const rates: Array<{ purity: string; ratePerGram: string; source: string; fetchedAt: Date }> = [];
    for (const purity of ["24K", "22K", "18K"]) {
      try {
        const r = await this.goldRate.getCurrentRate(purity, shopId);
        rates.push({ purity: r.purity, ratePerGram: r.ratePerGram.toString(), source: r.source, fetchedAt: r.fetchedAt });
      } catch {
        // Feed unavailable for this purity; leave it out of the ticker.
      }
    }
    return { available: rates.length > 0, rates, source: rates[0]?.source, fetchedAt: rates[0]?.fetchedAt };
  }

  /** Full live rate board (spot, gold, silver, updatedAt) for the dashboard. */
  async liveBoard(actor: AuthUser) {
    this.requireShop(actor);
    const board = await this.goldRate.getLiveBoard();
    return { available: Boolean(board), board };
  }

  async fetchGold(actor: AuthUser, input: MetalRateFetchDto) {
    const shopId = this.requireShop(actor);
    const response = await this.goldRate.getCurrentRate(input.purity, shopId);
    const rate = await this.prisma.metalRate.create({
      data: {
        shopId,
        metal: "gold",
        purity: response.purity,
        ratePerUnit: response.ratePerGram.toString(),
        unit: "gram",
        source: response.source,
        fetchedAt: response.fetchedAt
      }
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "metal_rate.fetched", entityType: "metal_rate", entityId: rate.id, source: "metal_rates_api", afterData: { purity: rate.purity, ratePerUnit: rate.ratePerUnit.toString(), source: rate.source } });
    return rate;
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireOwner(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
  }
}
