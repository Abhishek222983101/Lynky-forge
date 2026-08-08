"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_META, type DealStage } from "@/lib/types";

const STAGE_FILL: Record<DealStage, string> = {
  NEW_RFQ: "#6b7268",
  CONTACTED: "#2563eb",
  QUOTE_SENT: "#65a30d",
  NEGOTIATION: "#e8590c",
  WON: "#65a30d",
  LOST: "#e8590c",
};

export function StageDonut({
  dealsByStage,
  topLossReasons,
}: {
  dealsByStage: { stage: DealStage; count: number }[];
  topLossReasons: { reason: string; count: number }[];
}) {
  const data = dealsByStage
    .filter((d) => d.count > 0)
    .map((d) => ({ name: STAGE_META[d.stage]?.label ?? d.stage, value: d.count, stage: d.stage }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Deals by Stage</CardTitle>
      </CardHeader>
      <CardBody className="pt-2">
        {total === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <p className="max-w-[220px] text-center text-sm text-steel">
              No deals yet. Capture your first RFQ to get the pipeline moving.
            </p>
          </div>
        ) : (
          <>
            <div className="relative h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    innerRadius={56}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.map((d) => (
                      <Cell key={d.stage} fill={STAGE_FILL[d.stage]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} deals`, name]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e8ebe5",
                      fontSize: 12,
                      fontFamily: "var(--font-ibm-plex-mono)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-medium text-ink tnum">{total}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-steel">deals</span>
              </div>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {data.map((d) => (
                <li key={d.stage} className="flex items-center gap-2 text-xs text-steel">
                  <span className="size-2 shrink-0 rounded-[3px]" style={{ background: STAGE_FILL[d.stage] }} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="font-mono text-ink tnum">{d.value}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {topLossReasons.length > 0 ? (
          <div className="mt-5 border-t border-mist pt-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-steel">
              Why we lose
            </p>
            <ul className="mt-2 space-y-1.5">
              {topLossReasons.map((r) => (
                <li key={r.reason} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink">{r.reason}</span>
                  <span className="font-mono text-xs text-hazard tnum">×{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
