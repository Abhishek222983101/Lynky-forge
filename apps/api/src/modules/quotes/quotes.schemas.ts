import { QuoteStatus } from "@prisma/client";
import { z } from "zod";

export const quoteLineItemSchema = z.object({
  description: z.string().min(1).max(300),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative()
});

export const createQuoteSchema = z.object({
  dealId: z.string().uuid(),
  lineItems: z.array(quoteLineItemSchema).min(1),
  terms: z.array(z.string().max(300)).max(20).optional(),
  validUntil: z.coerce.date(),
  aiGenerated: z.boolean().default(false)
});

export const updateQuoteStatusSchema = z.object({
  status: z.nativeEnum(QuoteStatus)
});

export const listQuotesQuerySchema = z.object({
  status: z.nativeEnum(QuoteStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type QuoteLineItemDto = z.infer<typeof quoteLineItemSchema>;
export type CreateQuoteDto = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteStatusDto = z.infer<typeof updateQuoteStatusSchema>;
export type ListQuotesQueryDto = z.infer<typeof listQuotesQuerySchema>;
