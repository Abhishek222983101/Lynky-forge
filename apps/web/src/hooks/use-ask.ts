"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AskResult {
  answer: string;
  cards: { label: string; value: string }[];
}

export function useAskSuggestions() {
  return useQuery({
    queryKey: ["ask", "suggestions"],
    queryFn: () => api.get<string[]>("/ask/suggestions"),
  });
}

export function useAskQuestion() {
  return useMutation({
    mutationFn: (question: string) =>
      api.post<AskResult>("/ask/query", { question }),
  });
}
