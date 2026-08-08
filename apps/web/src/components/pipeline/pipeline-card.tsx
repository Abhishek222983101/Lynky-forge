"use client";

import { useDraggable } from "@dnd-kit/core";
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

export function PipelineCard({ deal, overlay }: { deal: DealListItem; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  const overdue = isDealOverdue(deal);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-lg border bg-surface p-3 transition-shadow",
        overdue ? "border-l-2 border-l-hazard border-mist" : "border-mist",
        isDragging && "opacity-40",
        overlay && "rotate-1 shadow-xl shadow-ink/10"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-ink">{deal.title}</p>
        <Badge tone={SCORE_TONE[deal.leadScore]} mono className="shrink-0">
          {deal.leadScore}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-steel">{deal.company.name}</p>
      <p className="mt-2 font-mono text-sm font-medium text-ink tnum">{formatINR(deal.value)}</p>
      <p className={cn("mt-1.5 font-mono text-[11px] tnum", overdue ? "font-medium text-hazard" : "text-steel")}>
        {overdue ? `follow-up ${relativeDate(deal.tasks[0].dueAt)}` : ageCallout(deal)}
      </p>
    </div>
  );
}
