"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { LostReasonDialog } from "@/components/pipeline/lost-reason-dialog";
import { PipelineCard } from "@/components/pipeline/pipeline-card";
import { PipelineColumn } from "@/components/pipeline/pipeline-column";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeals, useStageMove } from "@/hooks/use-deals";
import { ApiError } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { OPEN_STAGES, PIPELINE_STAGES, type DealListItem, type DealStage } from "@/lib/types";

export default function PipelinePage() {
  const { data, isLoading, isError, error, refetch } = useDeals();
  const stageMove = useStageMove();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<DealListItem | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const deals = useMemo(() => data?.data ?? [], [data]);
  const byStage = useMemo(() => {
    const map = new Map<DealStage, DealListItem[]>(PIPELINE_STAGES.map((s) => [s, []]));
    for (const d of deals) map.get(d.stage)?.push(d);
    return map;
  }, [deals]);
  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  const openValue = deals.filter((d) => OPEN_STAGES.includes(d.stage)).reduce((s, d) => s + (parseFloat(d.value) || 0), 0);

  function move(id: string, stage: DealStage, lostReason?: string) {
    stageMove.mutate(
      { id, stage, lostReason },
      {
        onError: (err) => {
          setBanner(err instanceof ApiError ? err.message : "Stage move failed. Try again.");
        },
      }
    );
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setActiveId(null);
    if (!e.over) return;
    const target = String(e.over.id) as DealStage;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === target) return;
    if (target === "LOST") {
      setPendingLost(deal);
      return;
    }
    move(id, target);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="font-mono text-xs text-steel tnum">
          {deals.length} deals · {formatINR(openValue)} open
        </p>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[280px] shrink-0 space-y-2.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">Pipeline didn&apos;t load.</p>
          <p className="mt-1 text-sm text-steel">
            {error instanceof Error ? error.message : "Check that the API is running, then retry."}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90"
          >
            Retry
          </button>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex snap-x gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage) => (
              <PipelineColumn key={stage} stage={stage} deals={byStage.get(stage) ?? []} activeId={activeId} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDeal ? <PipelineCard deal={activeDeal} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {pendingLost ? (
        <LostReasonDialog
          deal={pendingLost}
          loading={stageMove.isPending}
          onCancel={() => setPendingLost(null)}
          onConfirm={(reason) => {
            const deal = pendingLost;
            setPendingLost(null);
            move(deal.id, "LOST", reason);
          }}
        />
      ) : null}

      {banner ? (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-lg border border-hazard/40 bg-hazard-soft px-4 py-2.5 text-sm font-medium text-hazard shadow-lg">
          {banner}
        </div>
      ) : null}
    </div>
  );
}
