import { z } from "zod";

export const metalRateCreateSchema = z.object({
  metal: z.string().min(1).default("gold"),
  purity: z.string().optional().nullable(),
  ratePerUnit: z.coerce.string(),
  unit: z.string().min(1).default("gram"),
  source: z.string().min(1).default("manual"),
  fetchedAt: z.coerce.date().default(() => new Date())
});

export const metalRateFetchSchema = z.object({
  purity: z.string().min(1)
});

export type MetalRateCreateDto = z.infer<typeof metalRateCreateSchema>;
export type MetalRateFetchDto = z.infer<typeof metalRateFetchSchema>;
