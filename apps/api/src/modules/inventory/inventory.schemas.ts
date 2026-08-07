import { InventoryStatus, StockMovementType } from "@prisma/client";
import { z } from "zod";

export const inventoryItemCreateSchema = z.object({
  sku: z.string().optional().nullable(),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  purity: z.string().min(1),
  huidNumber: z.string().optional().nullable(),
  grossWeight: z.coerce.string().optional().nullable(),
  netWeight: z.coerce.string().optional().nullable(),
  estimatedValue: z.coerce.string().optional().nullable(),
  acquisitionDate: z.coerce.date().optional().nullable(),
  location: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  status: z.nativeEnum(InventoryStatus).optional()
});

export const inventoryListQuerySchema = z.object({
  status: z.nativeEnum(InventoryStatus).optional(),
  category: z.string().optional(),
  purity: z.string().optional(),
  q: z.string().optional()
});

export const inventoryStatusUpdateSchema = z.object({
  status: z.nativeEnum(InventoryStatus),
  notes: z.string().optional()
});

export const stockMovementCreateSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  movementType: z.nativeEnum(StockMovementType),
  quantity: z.coerce.number().int().positive().default(1),
  weight: z.coerce.string().optional().nullable(),
  toStatus: z.nativeEnum(InventoryStatus).optional().nullable(),
  referenceType: z.string().optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const slowStockQuerySchema = z.object({
  olderThanDays: z.coerce.number().int().positive().default(180)
});

export type InventoryItemCreateDto = z.infer<typeof inventoryItemCreateSchema>;
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
export type InventoryStatusUpdateDto = z.infer<typeof inventoryStatusUpdateSchema>;
export type StockMovementCreateDto = z.infer<typeof stockMovementCreateSchema>;
export type SlowStockQuery = z.infer<typeof slowStockQuerySchema>;
