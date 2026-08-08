"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useApplyDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { quoteId: string; lineItems: AiQuoteDraft["lineItems"]; terms: string[] }) =>
      api.patch(`/quotes/${vars.quoteId}/apply-draft`, {
        lineItems: vars.lineItems,
        terms: vars.terms,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", "detail", vars.quoteId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
