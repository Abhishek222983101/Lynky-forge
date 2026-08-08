import { Industry, RfqSource } from "@prisma/client";
import { z } from "zod";

/**
 * One-shot RFQ intake. Either reference an existing company (companyId)
 * or provide new-company fields and one is created first. A Deal in
 * NEW_RFQ stage and the RFQ itself are then created atomically.
 */
export const createRfqSchema = z
  .object({
    partName: z.string().min(1).max(200),
    partNo: z.string().min(1).max(100),
    material: z.string().min(1).max(100),
    qty: z.number().int().positive(),
    tolerance: z.string().max(100).optional(),
    targetPrice: z.number().nonnegative().optional(),
    deadline: z.coerce.date(),
    drawingNotes: z.string().max(2000).optional(),
    source: z.nativeEnum(RfqSource),

    // Existing company path
    companyId: z.string().uuid().optional(),

    // New company path (required if companyId absent)
    companyName: z.string().min(1).max(200).optional(),
    companyIndustry: z.nativeEnum(Industry).optional(),
    companyCity: z.string().max(100).optional(),

    // Optional deal overrides
    dealTitle: z.string().max(200).optional(),
    dealValue: z.number().nonnegative().optional()
  })
  .refine((data) => Boolean(data.companyId) || Boolean(data.companyName), {
    message: "Either companyId or companyName is required",
    path: ["companyId"]
  })
  .refine((data) => Boolean(data.companyId) || Boolean(data.companyIndustry), {
    message: "companyIndustry is required when creating a new company",
    path: ["companyIndustry"]
  });

export const listRfqsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type CreateRfqDto = z.infer<typeof createRfqSchema>;
export type ListRfqsQueryDto = z.infer<typeof listRfqsQuerySchema>;
