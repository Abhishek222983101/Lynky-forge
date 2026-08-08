"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateRfqPayload, CreateRfqResult, Paginated, RfqListItem } from "@/lib/types";

export function useRfqs() {
  return useQuery({
    queryKey: ["rfqs"],
    queryFn: () => api.get<Paginated<RfqListItem>>("/rfqs?limit=200"),
  });
}

export function useCreateRfq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRfqPayload) => api.post<CreateRfqResult>("/rfqs", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
