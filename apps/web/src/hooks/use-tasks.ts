"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Paginated, TaskStatus, TaskType } from "@/lib/types";

export interface TaskListItem {
  id: string;
  type: TaskType;
  status: TaskStatus;
  dueAt: string;
  message: string | null;
  autoCreated: boolean;
  deal: { id: string; title: string } | null;
  company: { id: string; name: string } | null;
}

export function useTasks(filter?: { status?: TaskStatus; overdue?: boolean }) {
  const params = new URLSearchParams();
  params.set("limit", "200");
  params.set("sort", "dueAt");
  params.set("order", "asc");
  if (filter?.status) params.set("status", filter.status);
  if (filter?.overdue) params.set("overdue", "true");
  return useQuery({
    queryKey: ["tasks", filter ?? "all"],
    queryFn: () => api.get<Paginated<TaskListItem>>(`/tasks?${params.toString()}`),
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: TaskStatus }) =>
      api.patch(`/tasks/${vars.id}/status`, { status: vars.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
