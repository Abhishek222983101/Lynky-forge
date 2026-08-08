"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export function WinGauge({ winRate, wonDeals, lostDeals }: { winRate: number | null; wonDeals: number; lostDeals: number }) {
  const pct = winRate === null ? 0 : Math.round(winRate * 100);
  const data = [{ name: "win", value: pct }];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Win Rate · 90 Days</CardTitle>
      </CardHeader>
      <CardBody className="pt-0">
        {winRate === null ? (
          <div className="flex h-44 items-center justify-center">
            <p className="max-w-[200px] text-center text-sm text-steel">
              No closed deals in the last 90 days. Win or lose one to start the clock.
            </p>
          </div>
        ) : (
          <>
            <div className="relative mx-auto h-40 max-w-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="72%"
                  innerRadius="70%"
                  outerRadius="100%"
                  data={data}
                  startAngle={180}
                  endAngle={0}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={6}
                    fill="#65a30d"
                    background={{ fill: "#e8ebe5" }}
                    angleAxisId={0}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
                <span className="font-mono text-3xl font-medium text-ink tnum">{pct}%</span>
              </div>
            </div>
            <p className="mt-1 text-center text-xs text-steel">
              <span className="font-mono text-signal tnum">{wonDeals} won</span>
              {" · "}
              <span className="font-mono text-hazard tnum">{lostDeals} lost</span>
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
