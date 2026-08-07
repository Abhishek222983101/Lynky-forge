import { z } from "zod";
import { buybackBundleCreateSchema, assignItemsSchema } from "@/modules/buyback/buyback.schemas";
import { contentRequestCreateSchema, promoteSlowStockSchema } from "@/modules/content/content.schemas";
import { inventoryItemCreateSchema, inventoryStatusUpdateSchema, slowStockQuerySchema, stockMovementCreateSchema } from "@/modules/inventory/inventory.schemas";
import { karigarCreateSchema, karigarJobCreateSchema, karigarReturnCreateSchema } from "@/modules/karigar/karigar.schemas";
import type { VoiceActionMetadata } from "./voice-actions";

/**
 * Amaan's per-owner voice registry (M3 stock / M5 karigar / M4 content / buyback).
 * The shared voice-actions.ts composes these into the catalog so we do not edit
 * the same names/schemas/metadata block and hit merge conflicts. New resolver
 * entities (karigar, karigar_job, inventory_item) live in voice-actions.ts's
 * VoiceEntityRef since the resolver is the one shared touch-point.
 */
export const opsVoiceActionNames = [
  // P1
  "slow_stock_report",
  "promote_slow_stock",
  "issue_karigar_job",
  "record_karigar_return",
  // P2
  "karigar_scorecard",
  "create_inventory_item",
  "record_stock_movement",
  "create_content_request",
  "buyback_summary",
  "create_buyback_bundle",
  "assign_buyback_items",
  // P3
  "update_inventory_status",
  "create_karigar",
  // M4 Content Studio publishing by voice
  "generate_content_post",
  "approve_content_post",
  "publish_content_post",
] as const;

export type OpsVoiceActionName = (typeof opsVoiceActionNames)[number];

export const opsVoiceActionSchemas = {
  slow_stock_report: slowStockQuerySchema,
  promote_slow_stock: promoteSlowStockSchema,
  issue_karigar_job: karigarJobCreateSchema,
  record_karigar_return: z.object({ jobId: z.string().uuid() }).merge(karigarReturnCreateSchema),
  karigar_scorecard: z.object({ karigarId: z.string().uuid() }),
  create_inventory_item: inventoryItemCreateSchema,
  record_stock_movement: stockMovementCreateSchema,
  create_content_request: contentRequestCreateSchema,
  buyback_summary: z.object({}),
  create_buyback_bundle: buybackBundleCreateSchema,
  assign_buyback_items: z.object({ bundleId: z.string().uuid() }).merge(assignItemsSchema),
  update_inventory_status: z.object({ inventoryItemId: z.string().uuid() }).merge(inventoryStatusUpdateSchema),
  create_karigar: karigarCreateSchema,
  generate_content_post: z.object({
    inventoryItemId: z.string().uuid().optional().nullable(),
    occasion: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    text: z.string().optional().nullable(),
  }),
  approve_content_post: z.object({}),
  publish_content_post: z.object({
    platforms: z.array(z.enum(["instagram", "facebook"])).optional(),
    scheduledAt: z.string().datetime().optional(),
  }),
} satisfies Record<OpsVoiceActionName, z.ZodTypeAny>;

export const opsVoiceActionMetadata: Record<OpsVoiceActionName, VoiceActionMetadata> = {
  slow_stock_report: {
    description: "Report slow-moving stock and the cash value stuck in it.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "olderThanDays: optional integer, default 180.",
    resolves: [],
  },
  promote_slow_stock: {
    description: "Create content generation jobs from slow-moving stock so it can be promoted.",
    requiresConfirmation: true,
    sensitiveFields: [],
    argumentGuide: "olderThanDays: optional integer default 180; occasion: optional; limit: optional integer default 10.",
    resolves: [],
  },
  issue_karigar_job: {
    description: "Issue gold to a karigar (goldsmith) as a new workshop job.",
    requiresConfirmation: true,
    sensitiveFields: ["issuedWeight", "purity"],
    argumentGuide: "karigarName: the goldsmith's name; itemDescription; purity like 22K; issuedWeight in grams.",
    resolves: ["karigar"],
  },
  record_karigar_return: {
    description: "Record a karigar's returned finished weight and scrap, and calculate the gold wastage.",
    requiresConfirmation: true,
    sensitiveFields: ["finishedWeight", "scrapWeight"],
    argumentGuide: "karigarName to pick that karigar's latest open job; finishedWeight in grams; scrapWeight in grams.",
    resolves: ["karigar_job"],
  },
  karigar_scorecard: {
    description: "Report a karigar's performance and open jobs.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "karigarName: the goldsmith's name.",
    resolves: ["karigar"],
  },
  create_inventory_item: {
    description: "Add a new stock item to inventory.",
    requiresConfirmation: true,
    sensitiveFields: ["purity", "grossWeight", "netWeight", "estimatedValue"],
    argumentGuide: "name; purity like 22K; category; grossWeight and/or netWeight in grams; estimatedValue in rupees; sku; location.",
    resolves: [],
  },
  record_stock_movement: {
    description: "Record a stock movement or adjustment for an item.",
    requiresConfirmation: true,
    sensitiveFields: ["movementType", "weight"],
    argumentGuide: "itemName or sku to identify the item; movementType (e.g. adjustment, stock_in, stock_out, return); weight in grams; notes.",
    resolves: ["inventory_item"],
  },
  create_content_request: {
    description: "Queue a marketing content request to generate LATER, without making the image now. Use only when the shopkeeper explicitly wants to save or queue it for later.",
    requiresConfirmation: true,
    sensitiveFields: [],
    argumentGuide: "itemName or sku to identify the item; occasion; prompt describing the post.",
    resolves: ["inventory_item"],
  },
  buyback_summary: {
    description: "Report a summary of old-gold and silver buyback items and bundles.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "no arguments.",
    resolves: [],
  },
  create_buyback_bundle: {
    description: "Create a buyback bundle of old gold or silver at a given rate.",
    requiresConfirmation: true,
    sensitiveFields: ["ratePerGram"],
    argumentGuide: "metal (gold or silver); purity like 22K; ratePerGram in rupees.",
    resolves: [],
  },
  assign_buyback_items: {
    description: "Assign recorded buyback items to an existing bundle.",
    requiresConfirmation: true,
    sensitiveFields: [],
    argumentGuide: "bundleId of the target bundle; itemIds of the buyback items to assign.",
    resolves: [],
  },
  update_inventory_status: {
    description: "Change a stock item's status (for example reserve or mark sold).",
    requiresConfirmation: true,
    sensitiveFields: ["status"],
    argumentGuide: "itemName or sku to identify the item; status one of available|reserved|sold|in_workshop|inactive; notes.",
    resolves: ["inventory_item"],
  },
  create_karigar: {
    description: "Add a new karigar (goldsmith) to the workshop.",
    requiresConfirmation: true,
    sensitiveFields: [],
    argumentGuide: "name; phone; specialization; notes.",
    resolves: [],
  },
  generate_content_post: {
    description: "Generate a marketing post image NOW for a jewellery item or occasion. This is the default when the shopkeeper says generate, make, or create a post, or asks for a post for an occasion.",
    requiresConfirmation: true,
    sensitiveFields: [],
    argumentGuide: "itemName or sku to base the post on the real product (optional); occasion like Diwali (optional); a short description of the post (optional).",
    resolves: ["inventory_item"],
  },
  approve_content_post: {
    description: "Approve the most recently generated post so it is ready to publish.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "no arguments; approves the latest generated post.",
    resolves: [],
  },
  publish_content_post: {
    description: "Publish the latest approved post to the connected Instagram and/or Facebook, now or at a scheduled time.",
    requiresConfirmation: true,
    sensitiveFields: [],
    argumentGuide: "platforms: optional list of instagram and/or facebook, default all connected; scheduledAt: optional date and time to schedule instead of posting now.",
    resolves: [],
  },
};
