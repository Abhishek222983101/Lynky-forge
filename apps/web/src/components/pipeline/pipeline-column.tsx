"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { STAGE_META, type DealListItem, type DealStage } from "@/lib/types";
import { PipelineCard } from "./pipeline-card";

export function PipelineColumn({
  stage,
  deals,
  activeId,
  onDraftAi,
  onDelete,
  draftingId,
}: {
  stage: DealStage;
  deals: DealListItem[];
  activeId: string | null;
  onDraftAi?: (deal: DealListItem) => void;
  onDelete?: (deal: DealListItem) => void;
  draftingId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];
  const total = deals.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);

  return (
    <div className="flex w-[280px] shrink-0 snap-start flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2 rounded-[3px]" style={{ background: meta.color }} />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">
          {meta.label}
        </span>
        <span className="font-mono text-[11px] text-steel tnum">· {deals.length}</span>
        <span className="ml-auto font-mono text-[11px] text-steel tnum">{formatINR(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex max-h-[calc(100vh-200px)] min-h-[420px] flex-col gap-2.5 overflow-y-auto rounded-xl border border-transparent p-1.5 motion-safe:transition-all motion-safe:duration-150",
          "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-mist",
          stage === "WON" && "bg-signal-soft/30",
          stage === "LOST" && "bg-hazard-soft/30",
          isOver && activeId && "border-signal bg-signal-soft/40 ring-2 ring-signal"
        )}
      >
        {deals.map((deal) => (
          <PipelineCard
            key={deal.id}
            deal={deal}
            onDraftAi={onDraftAi}
            onDelete={onDelete}
            drafting={draftingId === deal.id}
          />
        ))}
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-mist">
            <p className="font-mono text-[11px] text-steel">drop deals here</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
