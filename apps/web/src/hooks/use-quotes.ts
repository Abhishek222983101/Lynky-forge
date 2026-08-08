"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Paginated, QuoteDetail, QuoteListItem, QuoteStatus, QuoteStatusResult } from "@/lib/types";

export function useQuotes(status?: QuoteStatus) {
  return useQuery({
    queryKey: ["quotes", status ?? "all"],
    queryFn: () =>
      api.get<Paginated<QuoteListItem>>(`/quotes?limit=200${status ? `&status=${status}` : ""}`),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ["quotes", "detail", id],
    queryFn: () => api.get<QuoteDetail>(`/quotes/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: QuoteStatus }) =>
      api.patch<QuoteStatusResult>(`/quotes/${vars.id}/status`, { status: vars.status }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quotes", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
