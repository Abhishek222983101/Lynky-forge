// Social publishing orchestration for both providers:
//  - meta   : each shop OAuths its own Instagram/Facebook; we publish directly.
//  - buffer : shop pastes a Buffer access token (fallback / testing).
// Config (tokens + profiles) lives in Shop.socialConfig (JSON); tokens are never
// returned to the client. Scheduling is a durable DB poll: a scheduled post is
// stamped on the asset metadata and a 30s poller publishes it when due, so it
// survives restarts (no external queue needed).

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { MetaClient, MetaTarget } from "./meta.client";
import { decodeState, encodeState } from "./oauth-state";

type StoredProfile = MetaTarget & { id: string; service: string; username: string };

interface SocialConfig {
  provider: "meta";
  profiles: StoredProfile[];
  connectedAt: string;
}

@Injectable()
export class SocialService implements OnModuleInit {
  private readonly logger = new Logger("SocialService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaClient,
    private readonly audit: AuditLogsService,
  ) {}

  onModuleInit() {
    // Durable scheduler: publish any scheduled posts that have come due.
    if (env.APP_ENV === "test") return;
    setInterval(() => {
      this.processDueSchedules().catch((e) => this.logger.error(`schedule poll failed: ${e instanceof Error ? e.message : e}`));
    }, 30_000).unref();
  }

  // ---- status / connect / disconnect ------------------------------------

  async status(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    const config = await this.loadConfig(shopId);
    return {
      connected: Boolean(config),
      provider: config?.provider ?? null,
      profiles: (config?.profiles ?? []).map((p) => ({ id: p.id, service: p.service, username: p.username })),
    };
  }

  async disconnect(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    await this.prisma.shop.update({ where: { id: shopId }, data: { socialConfig: Prisma.DbNull } });
    await this.audit.create(this.prisma, { shopId, actorUserId: actor.id, action: "social.disconnected", entityType: "shop", entityId: shopId, source: "content_studio" });
    return { connected: false };
  }

  // ---- Meta OAuth --------------------------------------------------------

  /** Return the Meta login URL the owner is redirected to (with signed state). */
  metaAuthUrl(actor: AuthUser) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    const state = encodeState(shopId, actor.id);
    return { url: this.meta.authUrl(state) };
  }

  /** OAuth callback: exchange the code, fetch the shop's IG/FB targets, store them.
   * Returns a redirect target for the browser. */
  async handleMetaCallback(code: string | undefined, state: string | undefined, error?: string): Promise<string> {
    const web = env.WEB_APP_URL.replace(/\/$/, "");
    if (error) return `${web}/?screen=content&social=denied`;
    const decoded = state ? decodeState(state) : null;
    if (!code || !decoded) return `${web}/?screen=content&social=error`;
    try {
      const shortToken = await this.meta.exchangeCode(code);
      const longToken = await this.meta.longLivedToken(shortToken);
      const targets = await this.meta.listTargets(longToken);
      if (targets.length === 0) return `${web}/?screen=content&social=noprofiles`;
      await this.saveConfig(decoded.shopId, { provider: "meta", profiles: targets, connectedAt: new Date().toISOString() });
      await this.audit.create(this.prisma, { shopId: decoded.shopId, actorUserId: decoded.userId, action: "social.connected", entityType: "shop", entityId: decoded.shopId, source: "content_studio", afterData: { provider: "meta", profileCount: targets.length } });
      return `${web}/?screen=content&social=connected`;
    } catch (e) {
      this.logger.error(`Meta callback failed: ${e instanceof Error ? e.message : e}`);
      return `${web}/?screen=content&social=error`;
    }
  }

  // ---- publish / schedule ------------------------------------------------

  /** Voice helper: publish the latest APPROVED post to the connected handles
   * (optionally filtered by platform names), now or scheduled. */
  async publishLatest(actor: AuthUser, platforms?: string[], scheduledAt?: string) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    const config = await this.loadConfig(shopId);
    if (!config) throw new AppError("No social account is connected. Please connect Instagram or Facebook in the dashboard first.", 400);
    const asset = await this.prisma.contentAsset.findFirst({
      where: { shopId, metadata: { path: ["reviewStatus"], equals: "approved" } },
      orderBy: { createdAt: "desc" },
    });
    if (!asset) throw new AppError("Approve a post first, then I can publish it.", 400);
    let profiles = config.profiles;
    if (platforms && platforms.length) {
      const wanted = new Set(platforms.map((p) => p.toLowerCase()));
      profiles = profiles.filter((p) => wanted.has(p.service.toLowerCase()));
    }
    if (profiles.length === 0) throw new AppError("None of the requested platforms are connected.", 400);
    return this.publishAsset(actor, asset.id, profiles.map((p) => p.id), scheduledAt);
  }

  /** Publish now, or schedule for later if `scheduledAt` is a future time. */
  async publishAsset(actor: AuthUser, assetId: string, profileIds: string[], scheduledAt?: string) {
    const shopId = this.requireShop(actor);
    this.requireOwner(actor);
    if (!profileIds.length) throw new AppError("Pick at least one platform to publish to", 400);

    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime())) throw new AppError("Invalid schedule time", 400);
      if (when.getTime() <= Date.now()) throw new AppError("Schedule time must be in the future", 400);
      return this.markScheduled(shopId, actor.id, assetId, profileIds, when.toISOString());
    }
    return this.doPublish(shopId, actor.id, assetId, profileIds);
  }

  private async markScheduled(shopId: string, actorId: string, assetId: string, profileIds: string[], scheduledAtIso: string) {
    const { asset } = await this.loadApproved(shopId, assetId);
    const meta = (asset.metadata as Record<string, unknown>) ?? {};
    const updated = await this.prisma.contentAsset.update({
      where: { id: assetId },
      data: { metadata: { ...meta, publishStatus: "scheduled", scheduledAt: scheduledAtIso, scheduleTargets: profileIds, scheduledBy: actorId } as Prisma.InputJsonValue },
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actorId, action: "content_asset.scheduled", entityType: "content_asset", entityId: assetId, source: "content_studio", afterData: { scheduledAt: scheduledAtIso } });
    return { asset: updated, detail: `Scheduled for ${new Date(scheduledAtIso).toLocaleString()}`, scheduledAt: scheduledAtIso };
  }

  private async doPublish(shopId: string, actorId: string, assetId: string, profileIds: string[]) {
    const config = await this.loadConfig(shopId);
    if (!config) throw new AppError("Connect a social account first", 400);
    const { asset } = await this.loadApproved(shopId, assetId);
    const targets = config.profiles.filter((p) => profileIds.includes(p.id));
    if (targets.length === 0) throw new AppError("None of the chosen platforms are connected", 400);

    const caption = asset.caption ?? "";
    const url = asset.url ?? "";
    const imageUrl = /^https?:\/\//i.test(url) ? url : undefined;

    const succeeded: StoredProfile[] = [];
    const failures: string[] = [];

    // Meta: publish to each target (Facebook Page / Instagram) individually.
    for (const t of targets) {
      try {
        if (t.service === "instagram" && t.igUserId) {
          await this.meta.publishInstagram(t.igUserId, t.pageAccessToken, caption, imageUrl);
        } else {
          await this.meta.publishFacebook(t.pageId, t.pageAccessToken, caption, imageUrl);
        }
        succeeded.push(t);
      } catch (e) {
        failures.push(`${t.service}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (succeeded.length === 0) {
      await this.stampPublishError(assetId, failures.join("; "));
      throw new AppError(`Publish failed: ${failures.join("; ")}`, 502);
    }

    const publishedTo = succeeded.map((p) => ({ id: p.id, service: p.service, username: p.username }));
    const detail = imageUrl
      ? `Published to ${publishedTo.map((p) => p.service).join(", ")}${failures.length ? ` (some failed: ${failures.join("; ")})` : ""}`
      : `Published caption only (image needs a public URL) to ${publishedTo.map((p) => p.service).join(", ")}`;
    const meta = (asset.metadata as Record<string, unknown>) ?? {};
    const updated = await this.prisma.contentAsset.update({
      where: { id: assetId },
      data: { metadata: { ...meta, publishStatus: "published", publishedTo, publishDetail: detail, publishedAt: new Date().toISOString(), scheduledAt: null } as Prisma.InputJsonValue },
    });
    await this.audit.create(this.prisma, { shopId, actorUserId: actorId, action: "content_asset.published", entityType: "content_asset", entityId: assetId, source: "content_studio", afterData: { provider: config.provider, services: publishedTo.map((p) => p.service), imageAttached: Boolean(imageUrl) } });
    return { asset: updated, detail, publishedTo };
  }

  /** Called by the poller: publish everything whose scheduled time has passed. */
  private async processDueSchedules() {
    const due = await this.prisma.contentAsset.findMany({
      where: { metadata: { path: ["publishStatus"], equals: "scheduled" } },
      take: 25,
    });
    const now = Date.now();
    for (const asset of due) {
      const meta = (asset.metadata as Record<string, unknown>) ?? {};
      const when = new Date(String(meta.scheduledAt ?? ""));
      if (Number.isNaN(when.getTime()) || when.getTime() > now) continue;
      const targets = Array.isArray(meta.scheduleTargets) ? (meta.scheduleTargets as string[]) : [];
      const actorId = String(meta.scheduledBy ?? "");
      try {
        await this.doPublish(asset.shopId, actorId, asset.id, targets);
        this.logger.log(`Published scheduled asset ${asset.id}`);
      } catch (e) {
        this.logger.error(`Scheduled publish failed for ${asset.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // ---- helpers -----------------------------------------------------------

  private async loadApproved(shopId: string, assetId: string) {
    const asset = await this.prisma.contentAsset.findFirst({ where: { id: assetId, shopId } });
    if (!asset) throw new AppError("Content asset not found", 404);
    const meta = (asset.metadata as Record<string, unknown>) ?? {};
    if (meta.reviewStatus !== "approved") throw new AppError("Approve the post before publishing", 400);
    return { asset, meta };
  }

  private async stampPublishError(assetId: string, message: string) {
    const asset = await this.prisma.contentAsset.findUnique({ where: { id: assetId } });
    const meta = (asset?.metadata as Record<string, unknown>) ?? {};
    await this.prisma.contentAsset.update({ where: { id: assetId }, data: { metadata: { ...meta, publishStatus: "failed", publishError: message, scheduledAt: null } as Prisma.InputJsonValue } });
  }

  private async loadConfig(shopId: string): Promise<SocialConfig | null> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    const raw = shop?.socialConfig as unknown;
    if (!raw || typeof raw !== "object") return null;
    const config = raw as SocialConfig;
    return Array.isArray(config.profiles) && config.profiles.length ? config : null;
  }

  private async saveConfig(shopId: string, config: SocialConfig) {
    await this.prisma.shop.update({ where: { id: shopId }, data: { socialConfig: config as unknown as Prisma.InputJsonValue } });
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireOwner(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
  }
}
