import { Injectable } from "@nestjs/common";
import Decimal from "decimal.js";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { PrismaService } from "@/common/database/prisma.service";
import { GoldRateResponse } from "./gold-rate.types";

@Injectable()
export class GoldRateClient {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentRate(purity: string, shopId: string): Promise<GoldRateResponse> {
    const normalized = purity.toUpperCase().replace(/\s+/g, "").replace("CARAT", "K");

    // A configured external/static provider wins when set.
    if (env.GOLD_RATE_PROVIDER === "static_configured") {
      if (env.APP_ENV === "production") throw new AppError("Static gold-rate provider is not allowed in production", 503);
      const value = normalized === "22K" ? env.GOLD_RATE_STATIC_22K : env.GOLD_RATE_STATIC_24K;
      if (!value) throw new AppError(`No configured static gold rate for ${purity}`, 503);
      return { purity: normalized, ratePerGram: new Decimal(value), source: "static_configured", fetchedAt: new Date() };
    }

    // Sornam Price real-time feed: GET /api/current returns the India retail rate
    // for fine gold (999 = 24K) per gram in INR. We scale it to the requested karat.
    if (env.GOLD_RATE_PROVIDER === "sornam_price") {
      const live = await this.fetchSornamPrice(normalized);
      if (live) return live;
      // Feed unreachable: fall back to the last saved rate so sales still price.
      const fallback = await this.savedRate(normalized, shopId);
      if (fallback) return fallback;
      throw new AppError("Live gold price is unavailable and no saved rate exists yet.", 503);
    }

    if (env.GOLD_RATE_PROVIDER) throw new AppError(`Unsupported gold-rate provider: ${env.GOLD_RATE_PROVIDER}`, 503);

    // No provider configured: use the latest rate saved for this shop (written by
    // the Gold Rate screen / metal-rates endpoint), so voice sales work off it.
    const row = await this.savedRate(normalized, shopId);
    if (row) return row;
    throw new AppError("No gold rate is set. Save one in the Gold Rate screen (or configure GOLD_RATE_PROVIDER).", 503);
  }

  /** Full live board from Sornam Price (spot, gold per gram/10g, silver, updatedAt)
   * for the dashboard rate board. Returns null if the feed is not configured/up. */
  async getLiveBoard(): Promise<Record<string, unknown> | null> {
    if (env.GOLD_RATE_PROVIDER !== "sornam_price") return null;
    try {
      const response = await fetch(`${env.GOLD_RATE_API_URL.replace(/\/$/, "")}/api/current`);
      if (!response.ok) return null;
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Pull the live India gold rate from the Sornam Price server and scale to karat. */
  private async fetchSornamPrice(normalized: string): Promise<GoldRateResponse | null> {
    try {
      const response = await fetch(`${env.GOLD_RATE_API_URL.replace(/\/$/, "")}/api/current`);
      if (!response.ok) return null;
      const body = (await response.json()) as { gold?: { per_gram?: number }; updatedAt?: string };
      const fineGoldPerGram = Number(body?.gold?.per_gram);
      if (!Number.isFinite(fineGoldPerGram) || fineGoldPerGram <= 0) return null;
      // 999 fine gold is 24K; a lower karat is that fraction of pure gold.
      const karat = Number(normalized.replace(/[^0-9]/g, "")) || 24;
      const ratePerGram = new Decimal(fineGoldPerGram).mul(Math.min(karat, 24)).div(24).toDecimalPlaces(2);
      return { purity: normalized, ratePerGram, source: "sornam_price", fetchedAt: body.updatedAt ? new Date(body.updatedAt) : new Date() };
    } catch {
      return null;
    }
  }

  /** Latest manually-saved or previously-fetched rate for this shop. */
  private async savedRate(normalized: string, shopId: string): Promise<GoldRateResponse | null> {
    const row = await this.prisma.metalRate.findFirst({
      where: { shopId, metal: "gold", OR: [{ purity: normalized }, { purity: null }] },
      orderBy: { fetchedAt: "desc" }
    });
    if (!row) return null;
    return { purity: normalized, ratePerGram: new Decimal(row.ratePerUnit.toString()), source: "saved_rate", fetchedAt: row.fetchedAt };
  }
}
