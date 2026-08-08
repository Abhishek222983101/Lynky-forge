import { z } from "zod";

export const draftQuoteInputSchema = z.object({
  dealId: z.string().uuid(),
});

export type DraftQuoteInput = z.infer<typeof draftQuoteInputSchema>;

export interface AiQuoteLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface AiQuoteResult {
  lineItems: AiQuoteLineItem[];
  totalAmount: number;
  leadTimeDays: number;
  terms: string[];
}

export interface AiAskResult {
  answer: string;
  cards: { label: string; value: string }[];
}
