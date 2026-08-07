import { BuybackItemStatus } from "@prisma/client";
import { z } from "zod";

export const buybackItemCreateSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  itemName: z.string().min(1),
  testedPurity: z.string().min(1),
  assignedPurity: z.string().optional().nullable(),
  weight: z.coerce.string(),
  ratePerGram: z.coerce.string(),
  expectedValue: z.coerce.string().optional().nullable(),
  testingFormUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const buybackBundleCreateSchema = z.object({
  metal: z.string().min(1).default("gold"),
  purity: z.string().min(1),
  ratePerGram: z.coerce.string(),
  itemIds: z.array(z.string().uuid()).default([])
});

export const buybackListQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(BuybackItemStatus).optional()
});

export const assignItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1)
});

export type BuybackItemCreateDto = z.infer<typeof buybackItemCreateSchema>;
export type BuybackBundleCreateDto = z.infer<typeof buybackBundleCreateSchema>;
export type BuybackListQuery = z.infer<typeof buybackListQuerySchema>;
export type AssignItemsDto = z.infer<typeof assignItemsSchema>;
