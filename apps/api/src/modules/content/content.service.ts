import { Injectable } from "@nestjs/common";
import { ContentAssetType, ContentRequestStatus, InventoryStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { EventsService } from "@/modules/integrations/events/events.service";
import { ContentAssetCreateDto, ContentGenerateDto, ContentRequestCreateDto, ContentRequestListQuery, PromoteSlowStockDto } from "./content.schemas";
import { ContentStudioService } from "./studio/content-studio.service";

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly events: EventsService,
    private readonly studio: ContentStudioService,
  ) {}

  /**
   * M4 Content Studio end-to-end: create a durable request, generate assets via
   * the studio engine, persist them to the gallery (with AI label + caption),
   * mark the request ready, and emit content.asset_ready per asset.
   */
  async generateStudioAssets(actor: AuthUser, input: ContentGenerateDto) {
    const shopId = this.requireShop(actor);
    this.requireContentRole(actor);

    // Use the real product: if a stock item is linked and no image was uploaded,
    // pull that item's saved photo so generation runs in "with-product" mode.
    let productImages = input.productImages;
    if ((!productImages || productImages.length === 0) && input.inventoryItemId) {
      const item = await this.prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, shopId } });
      const ref = item?.photoUrl ? this.productRefFromPhoto(item.photoUrl) : null;
      if (ref) productImages = [ref];
    }

    const generated = await this.studio.generate({ ...input, productImages });

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await this.createRequestTx(
        tx,
        shopId,
        actor.id,
        { inventoryItemId: input.inventoryItemId ?? undefined, occasion: input.occasion ?? undefined, prompt: input.text },
        "content_studio",
      );

      const assets = [];
      for (const asset of generated) {
        const record = await tx.contentAsset.create({
          data: {
            shopId,
            contentRequestId: request.id,
            assetType: asset.kind === "reel" ? ContentAssetType.reel : ContentAssetType.still,
            url: asset.url ?? undefined,
            caption: asset.caption ?? undefined,
            aiLabel: asset.aiLabel ?? undefined,
            metadata: asset.meta as Prisma.InputJsonValue,
          },
        });
        assets.push(record);
        await this.events.publish(tx, shopId, "content.asset_ready", {
          shopId,
          contentRequestId: request.id,
          contentAssetId: record.id,
          assetType: record.assetType,
        });
      }

      const readyRequest = await tx.contentRequest.update({
        where: { id: request.id },
        data: { status: ContentRequestStatus.ready },
      });
      await this.audit.create(tx, {
        shopId,
        actorUserId: actor.id,
        action: "content_studio.generated",
        entityType: "content_request",
        entityId: request.id,
        source: "content_studio",
        afterData: { assetCount: assets.length },
      });

      return { request: readyRequest, assets };
    }, { timeout: 30000, maxWait: 10000 }); // generated images are large data URLs; allow room to persist

    await this.enqueueReelPolls(result.assets);
    return result;
  }

  /** Generate assets for an already-saved request (the "queue now, generate later"
   * flow). Uses the request's prompt/occasion and its linked item's photo, then
   * attaches the assets to that same request and marks it ready. */
  async generateForRequest(actor: AuthUser, requestId: string) {
    const shopId = this.requireShop(actor);
    this.requireContentRole(actor);
    const request = await this.prisma.contentRequest.findFirst({ where: { id: requestId, shopId }, include: { inventoryItem: true } });
    if (!request) throw new AppError("Content request not found", 404);

    const item = request.inventoryItem;
    const text = request.prompt || (item ? `${item.purity} ${item.name}` : "Jewellery marketing post");
    const productImages = item?.photoUrl ? [this.productRefFromPhoto(item.photoUrl)] : undefined;

    const generated = await this.studio.generate({
      text,
      occasion: request.occasion ?? undefined,
      category: item?.category ?? undefined,
      requestedType: "both",
      language: "en",
      productImages
    } as ContentGenerateDto);

    const result = await this.prisma.$transaction(async (tx) => {
      const assets = [];
      for (const asset of generated) {
        const record = await tx.contentAsset.create({
          data: {
            shopId,
            contentRequestId: request.id,
            assetType: asset.kind === "reel" ? ContentAssetType.reel : ContentAssetType.still,
            url: asset.url ?? undefined,
            caption: asset.caption ?? undefined,
            aiLabel: asset.aiLabel ?? undefined,
            metadata: asset.meta as Prisma.InputJsonValue
          }
        });
        assets.push(record);
        await this.events.publish(tx, shopId, "content.asset_ready", { shopId, contentRequestId: request.id, contentAssetId: record.id, assetType: record.assetType });
      }
      const ready = await tx.contentRequest.update({ where: { id: request.id }, data: { status: ContentRequestStatus.ready } });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "content_studio.generated", entityType: "content_request", entityId: request.id, source: "content_studio", afterData: { assetCount: assets.length, fromRequest: true } });
      return { request: ready, assets };
    }, { timeout: 30000, maxWait: 10000 }); // generated images are large data URLs; allow room to persist

    await this.enqueueReelPolls(result.assets);
    return result;
  }

  /** Turn a stored product photo into a generation reference. A base64 data URL
   * becomes the inline reference Gemini preserves; a plain URL is passed through. */
  private productRefFromPhoto(photoUrl: string): { base64?: string; url?: string; mimeType?: string } {
    const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(photoUrl);
    if (match) return { base64: match[2], mimeType: match[1] || "image/jpeg" };
    return { url: photoUrl };
  }

  /** Enqueue Veo reel-completion polling for any reel asset still processing. */
  private async enqueueReelPolls(assets: Array<{ id: string; assetType: ContentAssetType; metadata: Prisma.JsonValue }>) {
    for (const asset of assets) {
      const md = (asset.metadata ?? {}) as Record<string, unknown>;
      if (asset.assetType === ContentAssetType.reel && md.status === "processing" && typeof md.operation === "string") {
        const { contentQueue } = await import("@/workers/queues/queue");
        await contentQueue.add(
          "reel-poll",
          { contentAssetId: asset.id, operation: md.operation },
          { attempts: 40, backoff: { type: "fixed", delay: 15000 }, removeOnComplete: true, removeOnFail: true },
        );
      }
    }
  }

  async createRequest(actor: AuthUser, input: ContentRequestCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireContentRole(actor);
    return this.createRequestTx(this.prisma, shopId, actor.id, input, "content_api");
  }

  async createRequestTx(db: Prisma.TransactionClient | PrismaService, shopId: string, actorUserId: string, input: ContentRequestCreateDto, source: string) {
    if (input.inventoryItemId) {
      const item = await db.inventoryItem.findFirst({ where: { id: input.inventoryItemId, shopId } });
      if (!item) throw new AppError("Inventory item not found", 404);
    }
    const request = await db.contentRequest.create({
      data: {
        shopId,
        inventoryItemId: input.inventoryItemId ?? undefined,
        occasion: input.occasion ?? undefined,
        requestedBy: actorUserId,
        prompt: input.prompt ?? undefined,
        status: ContentRequestStatus.requested
      }
    });
    await this.events.publish(db, shopId, "content.requested", { shopId, contentRequestId: request.id, inventoryItemId: request.inventoryItemId, occasion: request.occasion });
    await this.audit.create(db, { shopId, actorUserId, action: "content_request.created", entityType: "content_request", entityId: request.id, source, afterData: { inventoryItemId: request.inventoryItemId, occasion: request.occasion } });
    return request;
  }

  listRequests(actor: AuthUser, query: ContentRequestListQuery) {
    const shopId = this.requireShop(actor);
    return this.prisma.contentRequest.findMany({
      where: { shopId, status: query.status, inventoryItemId: query.inventoryItemId },
      include: { inventoryItem: true, assets: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async getRequest(actor: AuthUser, requestId: string) {
    const shopId = this.requireShop(actor);
    const request = await this.prisma.contentRequest.findFirst({ where: { id: requestId, shopId }, include: { inventoryItem: true, assets: true } });
    if (!request) throw new AppError("Content request not found", 404);
    return request;
  }

  async addAsset(actor: AuthUser, requestId: string, input: ContentAssetCreateDto) {
    const shopId = this.requireShop(actor);
    this.requireContentRole(actor);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.contentRequest.findFirst({ where: { id: requestId, shopId } });
      if (!request) throw new AppError("Content request not found", 404);
      const asset = await tx.contentAsset.create({
        data: {
          shopId,
          contentRequestId: request.id,
          assetType: input.assetType,
          url: input.url ?? undefined,
          caption: input.caption ?? undefined,
          metadata: input.metadata as Prisma.InputJsonValue ?? undefined
        }
      });
      await tx.contentRequest.update({ where: { id: request.id }, data: { status: ContentRequestStatus.ready } });
      await this.events.publish(tx, shopId, "content.asset_ready", { shopId, contentRequestId: request.id, contentAssetId: asset.id, assetType: asset.assetType });
      await this.audit.create(tx, { shopId, actorUserId: actor.id, action: "content_asset.created", entityType: "content_asset", entityId: asset.id, source: "content_api", afterData: { contentRequestId: request.id, assetType: asset.assetType } });
      return asset;
    });
  }

  /** Owner review of a generated asset. Approve marks it ready to publish;
   * revise marks it as needing changes. Status lives in the asset metadata so
   * no schema change is needed, and it drives the gallery's status pill. */
  async reviewAsset(actor: AuthUser, assetId: string, status: "approved" | "revised", note?: string) {
    const shopId = this.requireShop(actor);
    this.requireContentRole(actor);
    const asset = await this.prisma.contentAsset.findFirst({ where: { id: assetId, shopId } });
    if (!asset) throw new AppError("Content asset not found", 404);
    const metadata = {
      ...((asset.metadata as Record<string, unknown>) ?? {}),
      reviewStatus: status,
      reviewNote: note ?? null,
    };
    const updated = await this.prisma.contentAsset.update({
      where: { id: assetId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
    await this.audit.create(this.prisma, {
      shopId,
      actorUserId: actor.id,
      action: `content_asset.${status}`,
      entityType: "content_asset",
      entityId: assetId,
      source: "content_studio",
      afterData: { reviewStatus: status },
    });
    return updated;
  }

  /** Voice helper: approve/revise the most recently generated post. */
  async reviewLatestAsset(actor: AuthUser, status: "approved" | "revised") {
    const shopId = this.requireShop(actor);
    const asset = await this.prisma.contentAsset.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" } });
    if (!asset) throw new AppError("There are no generated posts yet. Generate a post first.", 404);
    return this.reviewAsset(actor, asset.id, status);
  }

  async promoteSlowStock(actor: AuthUser, input: PromoteSlowStockDto) {
    const shopId = this.requireShop(actor);
    this.requireContentRole(actor);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - input.olderThanDays);
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.inventoryItem.findMany({
        where: { shopId, status: InventoryStatus.available, acquisitionDate: { lte: cutoff } },
        orderBy: [{ acquisitionDate: "asc" }],
        take: input.limit
      });
      const requests = [];
      for (const item of items) {
        requests.push(await this.createRequestTx(tx, shopId, actor.id, {
          inventoryItemId: item.id,
          occasion: input.occasion ?? "slow stock promotion",
          prompt: `Create promotion content for ${item.name}`
        }, "slow_stock_promotion"));
      }
      await this.events.publish(tx, shopId, "slow_stock.promotion_requested", { shopId, inventoryItemIds: items.map((item) => item.id), contentRequestIds: requests.map((request) => request.id) });
      return { count: requests.length, requests };
    });
  }

  private requireShop(actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }

  private requireContentRole(actor: AuthUser) {
    if (actor.role !== UserRole.owner && actor.role !== UserRole.admin) throw new AppError("Insufficient permissions", 403);
  }
}
