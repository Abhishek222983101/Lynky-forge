"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotes } from "@/hooks/use-quotes";
import { cn } from "@/lib/cn";
import { formatDate, formatINR, relativeDate } from "@/lib/format";
import { QUOTE_STATUS_META, type QuoteStatus } from "@/lib/types";

const FILTERS: (QuoteStatus | "ALL")[] = ["ALL", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

export default function QuotesPage() {
  const [filter, setFilter] = useState<QuoteStatus | "ALL">("ALL");
  const { data, isLoading, isError, refetch } = useQuotes(filter === "ALL" ? undefined : filter);
  const quotes = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="font-mono text-xs text-steel tnum">{data?.total ?? 0} total</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              filter === f
                ? "border-signal bg-signal-soft text-signal"
                : "border-mist bg-surface text-steel hover:border-steel/40 hover:text-ink"
            )}
          >
            {f === "ALL" ? "All" : QUOTE_STATUS_META[f].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">Quotes didn&apos;t load.</p>
          <p className="mt-1 text-sm text-steel">Check that the API is running, then retry.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90"
          >
            Retry
          </button>
        </Card>
      ) : quotes.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">
            {filter === "ALL" ? "No quotes yet." : `No ${QUOTE_STATUS_META[filter as QuoteStatus].label.toLowerCase()} quotes.`}
          </p>
          <p className="mt-1 text-sm text-steel">
            {filter === "ALL"
              ? "Quotes are drafted from RFQs — open a deal in the pipeline to start one."
              : "Try a different status filter."}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-mist">
                  <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Quote No</th>
                  <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Deal</th>
                  <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Company</th>
                  <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Status</th>
                  <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Total</th>
                  <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Valid Until</th>
                  <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-mist/70 transition-colors last:border-0 hover:bg-canvas">
                    <td className="px-5 py-3.5">
                      <Link href={`/quotes/${q.id}`} className="font-mono font-medium text-info tnum hover:underline">
                        {q.quoteNo}
                      </Link>
                      {q.aiGenerated ? (
                        <Badge tone="signal" className="ml-2">AI</Badge>
                      ) : null}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3.5 font-medium text-ink">{q.deal.title}</td>
                    <td className="px-4 py-3.5 text-steel">{q.deal.company.name}</td>
                    <td className="px-4 py-3.5">
                      <Badge tone={QUOTE_STATUS_META[q.status].tone}>{QUOTE_STATUS_META[q.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tnum text-ink">{formatINR(q.totalAmount)}</td>
                    <td className="px-4 py-3.5 font-mono text-[12px] text-steel tnum">{formatDate(q.validUntil)}</td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-steel tnum">{relativeDate(q.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
