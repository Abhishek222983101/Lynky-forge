import { ContentAssetType, ContentRequestStatus } from "@prisma/client";
import { z } from "zod";

export const contentRequestCreateSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  occasion: z.string().optional().nullable(),
  prompt: z.string().optional().nullable()
});

export const contentAssetCreateSchema = z.object({
  assetType: z.nativeEnum(ContentAssetType),
  url: z.string().url().optional().nullable(),
  caption: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable()
});

export const contentRequestListQuerySchema = z.object({
  status: z.nativeEnum(ContentRequestStatus).optional(),
  inventoryItemId: z.string().uuid().optional()
});

export const promoteSlowStockSchema = z.object({
  olderThanDays: z.coerce.number().int().positive().default(180),
  occasion: z.string().optional().nullable(),
  limit: z.coerce.number().int().positive().max(50).default(10)
});

export type ContentRequestCreateDto = z.infer<typeof contentRequestCreateSchema>;
export type ContentAssetCreateDto = z.infer<typeof contentAssetCreateSchema>;
export type ContentRequestListQuery = z.infer<typeof contentRequestListQuerySchema>;
export type PromoteSlowStockDto = z.infer<typeof promoteSlowStockSchema>;

// M4 Content Studio - generation request (still / reel / carousel / both).
const imageRefSchema = z.object({
  url: z.string().url().optional(),
  base64: z.string().optional(),
  mimeType: z.string().optional(),
});

export const contentGenerateSchema = z.object({
  text: z.string().min(1),
  inventoryItemId: z.string().uuid().optional().nullable(),
  productImages: z.array(imageRefSchema).optional(),
  requestedType: z.enum(["image", "reel", "carousel", "both"]).optional(),
  occasion: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  language: z.enum(["en", "ta"]).optional(),
});

export type ContentGenerateDto = z.infer<typeof contentGenerateSchema>;

// Social publishing (Meta).
export const socialPublishSchema = z.object({
  profileIds: z.array(z.string().min(1)).min(1),
  scheduledAt: z.string().datetime().optional(),
});
export const contentReviewSchema = z.object({ note: z.string().max(500).optional() });

export type SocialPublishDto = z.infer<typeof socialPublishSchema>;
export type ContentReviewDto = z.infer<typeof contentReviewSchema>;
