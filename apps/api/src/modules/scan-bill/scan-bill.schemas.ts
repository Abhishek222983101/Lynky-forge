import { z } from "zod";
import { manualSaleSchema } from "@/modules/sales/sales.schemas";

export const scanBillCreateSchema = z.object({
  sourceFileUrl: z.string().url().optional().nullable(),
  rawText: z.string().optional().nullable(),
  extractedPayload: manualSaleSchema.optional()
}).refine((value) => value.sourceFileUrl || value.rawText || value.extractedPayload, {
  message: "sourceFileUrl, rawText, or extractedPayload is required"
});

export const scanBillConfirmSchema = z.object({
  confirmation: z.string().min(1)
});

export type ScanBillCreateDto = z.infer<typeof scanBillCreateSchema>;
export type ScanBillConfirmDto = z.infer<typeof scanBillConfirmSchema>;
