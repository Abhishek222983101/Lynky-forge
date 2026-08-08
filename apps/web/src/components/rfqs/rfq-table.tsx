"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { relativeDate } from "@/lib/format";
import { RFQ_SOURCE_META, STAGE_META, type DealStage, type RfqListItem } from "@/lib/types";

const STAGE_TONE: Record<DealStage, "signal" | "hazard" | "steel" | "info" | "neutral"> = {
  NEW_RFQ: "steel",
  CONTACTED: "info",
  QUOTE_SENT: "info",
  NEGOTIATION: "neutral",
  WON: "signal",
  LOST: "hazard",
};

export function RfqTable({ rfqs }: { rfqs: RfqListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-mist">
            <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Part</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Material</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Qty</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Tolerance</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Company</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Source</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Deal Stage</th>
            <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Received</th>
          </tr>
        </thead>
        <tbody>
          {rfqs.map((r) => (
            <tr key={r.id} className="border-b border-mist/70 transition-colors last:border-0 hover:bg-canvas">
              <td className="px-5 py-3.5">
                <p className="font-medium text-ink">{r.partName}</p>
                <p className="font-mono text-[12px] text-steel tnum">{r.partNo}</p>
              </td>
              <td className="px-4 py-3.5 text-steel">{r.material}</td>
              <td className="px-4 py-3.5 text-right font-mono tnum text-ink">{r.qty.toLocaleString("en-IN")}</td>
              <td className="px-4 py-3.5 font-mono text-[12px] text-steel tnum">{r.tolerance ?? "—"}</td>
              <td className="px-4 py-3.5">
                <Link href={`/companies/${r.company.id}`} className="text-ink underline-offset-4 hover:underline">
                  {r.company.name}
                </Link>
              </td>
              <td className="px-4 py-3.5 text-steel">{RFQ_SOURCE_META[r.source]}</td>
              <td className="px-4 py-3.5">
                <Link href="/pipeline">
                  <Badge tone={STAGE_TONE[r.deal.stage]}>{STAGE_META[r.deal.stage].label}</Badge>
                </Link>
              </td>
              <td className="px-5 py-3.5 font-mono text-[12px] text-steel tnum">{relativeDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
