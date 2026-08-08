"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AiQuoteDraft {
  lineItems: { description: string; qty: number; unitPrice: number }[];
  totalAmount: number;
  leadTimeDays: number;
  terms: string[];
}

export function useDraftQuote() {
  return useMutation({
    mutationFn: (dealId: string) =>
      api.post<AiQuoteDraft>("/quotes/draft", { dealId }),
  });
}
