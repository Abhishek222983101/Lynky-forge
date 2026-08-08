"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DealListItem, DealStage, Paginated, StageMoveResult } from "@/lib/types";

export function useDeals() {
  return useQuery({
    queryKey: ["deals"],
    queryFn: () => api.get<Paginated<DealListItem>>("/deals?limit=200&sort=updatedAt&order=desc"),
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ success: boolean; id: string }>(`/deals/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["deals"] });
      const prev = qc.getQueryData<Paginated<DealListItem>>(["deals"]);
      if (prev) {
        qc.setQueryData<Paginated<DealListItem>>(["deals"], {
          ...prev,
          data: prev.data.filter((d) => d.id !== id),
          total: prev.total - 1,
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deals"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useStageMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; stage: DealStage; lostReason?: string }) =>
      api.patch<StageMoveResult>(`/deals/${vars.id}/stage`, { stage: vars.stage, lostReason: vars.lostReason }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["deals"] });
      const prev = qc.getQueryData<Paginated<DealListItem>>(["deals"]);
      if (prev) {
        qc.setQueryData<Paginated<DealListItem>>(["deals"], {
          ...prev,
          data: prev.data.map((d) => (d.id === vars.id ? { ...d, stage: vars.stage } : d)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deals"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
