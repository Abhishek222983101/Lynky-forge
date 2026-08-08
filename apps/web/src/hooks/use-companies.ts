"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CompanyDetail, CompanyListItem } from "@/lib/types";

/** Companies list is a plain array (not paginated) — filter client-side. */
export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: () => api.get<CompanyListItem[]>("/companies"),
  });
}

const COMPANY_360_INCLUDE = "deals,contacts,activities,tasks";

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ["companies", id],
    queryFn: () => api.get<CompanyDetail>(`/companies/${id}?include=${COMPANY_360_INCLUDE}`),
    enabled: Boolean(id),
  });
}
