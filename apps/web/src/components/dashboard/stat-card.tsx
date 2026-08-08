import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "default" | "hazard";
}) {
  return (
    <Card className={cn("p-5", tone === "hazard" && "border-hazard/40 bg-hazard-soft/40")}>
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-steel">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-[30px] font-medium leading-none tracking-tight tnum",
          tone === "hazard" ? "text-hazard" : "text-ink"
        )}
      >
        {value}
      </p>
      {sub ? <div className="mt-2.5 text-xs text-steel">{sub}</div> : null}
    </Card>
  );
}
