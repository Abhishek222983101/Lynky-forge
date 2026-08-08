"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DealListItem } from "@/lib/types";

const QUICK_REASONS = ["Price too high", "Went to competitor", "Project cancelled", "No budget"];

export function LostReasonDialog({
  deal,
  onConfirm,
  onCancel,
  loading,
}: {
  deal: DealListItem;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-xl border border-mist bg-surface p-6">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-hazard">Marking lost</p>
        <h2 className="mt-1.5 font-display text-lg font-semibold text-ink">Why did we lose this one?</h2>
        <p className="mt-1 truncate text-sm text-steel">{deal.title}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                reason === r ? "bg-hazard-soft text-hazard" : "bg-canvas text-steel hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Or type the reason…"
          className="mt-3 w-full rounded-lg border border-mist bg-surface px-3 py-2 text-sm text-ink placeholder:text-steel/60 focus:border-signal focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-steel">This feeds the &quot;why we lose&quot; insight on the dashboard.</p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim())} disabled={!reason.trim()} loading={loading}>
            Mark as lost
          </Button>
        </div>
      </div>
    </div>
  );
}
