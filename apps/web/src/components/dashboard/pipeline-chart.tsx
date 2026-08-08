"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAxisINR, formatINR, shortDay } from "@/lib/format";

interface Point {
  date: string;
  value: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-mist bg-surface px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-steel">{label ? shortDay(label) : ""}</p>
      <p className="font-mono text-sm font-medium text-ink tnum">{formatINR(payload[0].value)}</p>
    </div>
  );
}

export function PipelineChart({ series }: { series: { date: string; pipelineValue: string }[] }) {
  const data: Point[] = series.map((s) => ({ date: s.date, value: parseFloat(s.pipelineValue) }));

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle>Pipeline Value · 60 Days</CardTitle>
        <span className="font-mono text-[11px] text-steel tnum">INR</span>
      </CardHeader>
      <CardBody className="pt-2">
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="max-w-[240px] text-center text-sm text-steel">
              No trend data yet. Daily snapshots appear here as the pipeline moves.
            </p>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e8ebe5" strokeDasharray="0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 11, fill: "#6b7268", fontFamily: "var(--font-ibm-plex-mono)" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e8ebe5" }}
                  minTickGap={40}
                />
                <YAxis
                  tickFormatter={formatAxisINR}
                  tick={{ fontSize: 11, fill: "#6b7268", fontFamily: "var(--font-ibm-plex-mono)" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#6b7268", strokeDasharray: "3 3" }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#pipelineFill)"
                  dot={false}
                  activeDot={{ r: 3.5, fill: "#2563eb", stroke: "#fff", strokeWidth: 1.5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
