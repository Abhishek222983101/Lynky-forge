import { DealSource, DealStage, LeadScore } from "@prisma/client";
import { z } from "zod";

export const createDealSchema = z.object({
  title: z.string().min(1).max(200),
  companyId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  value: z.number().nonnegative(),
  expectedClose: z.coerce.date().optional(),
  source: z.nativeEnum(DealSource).optional(),
  leadScore: z.nativeEnum(LeadScore).default(LeadScore.WARM)
});

export const updateDealSchema = createDealSchema.partial().omit({ companyId: true });

export const stageMoveSchema = z
  .object({
    stage: z.nativeEnum(DealStage),
    lostReason: z.string().min(1).max(500).optional()
  })
  .refine((data) => data.stage !== DealStage.LOST || Boolean(data.lostReason), {
    message: "lostReason is required when moving a deal to LOST",
    path: ["lostReason"]
  });

export const listDealsQuerySchema = z.object({
  stage: z.nativeEnum(DealStage).optional(),
  companyId: z.string().uuid().optional(),
  sort: z.enum(["createdAt", "updatedAt", "value", "expectedClose"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type CreateDealDto = z.infer<typeof createDealSchema>;
export type UpdateDealDto = z.infer<typeof updateDealSchema>;
export type StageMoveDto = z.infer<typeof stageMoveSchema>;
export type ListDealsQueryDto = z.infer<typeof listDealsQuerySchema>;
