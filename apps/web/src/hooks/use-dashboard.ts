"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DashboardData } from "@/lib/types";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/dashboard"),
    refetchInterval: 30_000,
  });
}
