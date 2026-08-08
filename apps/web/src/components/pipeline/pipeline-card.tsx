"use client";

import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { compactAge, formatINR, relativeDate } from "@/lib/format";
import type { DealListItem } from "@/lib/types";

const SCORE_TONE = { HOT: "hazard", WARM: "signal", COLD: "steel" } as const;

export function isDealOverdue(deal: DealListItem): boolean {
  const t = deal.tasks[0];
  return Boolean(t && new Date(t.dueAt).getTime() < Date.now());
}

function ageCallout(deal: DealListItem): string {
  const age = compactAge(deal.createdAt);
  if (deal.quote && (deal.quote.status === "SENT" || deal.quote.status === "ACCEPTED")) {
    return `±${age} · ${deal.quote.quoteNo} sent`;
  }
  if (deal.stage === "WON") return `±${age} · closed won`;
  if (deal.stage === "LOST") return `±${age} · lost`;
  return `±${age} · opened`;
}

export function PipelineCard({
  deal,
  overlay,
  onDraftAi,
  onDelete,
  drafting,
}: {
  deal: DealListItem;
  overlay?: boolean;
  onDraftAi?: (deal: DealListItem) => void;
  onDelete?: (deal: DealListItem) => void;
  drafting?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  const overdue = isDealOverdue(deal);
  const isTerminal = deal.stage === "WON" || deal.stage === "LOST";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "group relative cursor-grab touch-none rounded-lg border bg-surface p-3 transition-shadow",
        overdue ? "border-l-2 border-l-hazard border-mist" : "border-mist",
        isDragging && "opacity-40",
        overlay && "rotate-1 shadow-xl shadow-ink/10"
      )}
    >
      {/* Delete button — appears on hover */}
      {onDelete && !isTerminal && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(deal);
          }}
          className="absolute right-1.5 top-1.5 z-10 hidden size-6 items-center justify-center rounded-md bg-surface/80 text-steel hover:bg-hazard-soft hover:text-hazard group-hover:flex"
          aria-label="Delete deal"
          title="Delete deal"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}

      <div className="flex items-start justify-between gap-2 pr-6">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-ink">{deal.title}</p>
        <Badge tone={SCORE_TONE[deal.leadScore]} mono className="shrink-0">
          {deal.leadScore}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-steel">{deal.company.name}</p>
      <p className="mt-2 font-mono text-sm font-medium text-ink tnum">{formatINR(deal.value)}</p>

      {/* Quote link or AI draft button */}
      {deal.quote ? (
        <Link
          href={`/quotes/${deal.quote.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="mt-1.5 inline-block font-mono text-[11px] font-medium text-signal hover:underline tnum"
        >
          {deal.quote.quoteNo} →
        </Link>
      ) : (
        <p className="mt-1.5 font-mono text-[11px] text-steel tnum">no quote</p>
      )}

      <p className={cn("mt-1 font-mono text-[11px] tnum", overdue ? "font-medium text-hazard" : "text-steel")}>
        {overdue ? `follow-up ${relativeDate(deal.tasks[0].dueAt)}` : ageCallout(deal)}
      </p>

      {/* AI Draft button — for open deals with no quote */}
      {onDraftAi && !deal.quote && !isTerminal && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDraftAi(deal);
          }}
          disabled={drafting}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-signal/30 bg-signal-soft px-2 py-1.5 text-[11px] font-medium text-signal hover:border-signal/50 hover:bg-signal-soft/80 disabled:opacity-50"
        >
          <Sparkles className="size-3" />
          {drafting ? "Drafting…" : "Draft Quote with AI"}
        </button>
      )}
    </div>
  );
}
