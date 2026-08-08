"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { STAGE_META, type DealStage } from "@/lib/types";

interface HotDeal {
  id: string;
  title: string;
  value: string;
  stage: DealStage;
  company: { name: string };
}

export function HotDealsList({ deals }: { deals: HotDeal[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Hot Deals</CardTitle>
        <Badge tone="hazard" mono>
          {deals.length} live
        </Badge>
      </CardHeader>
      <CardBody className="pt-2">
        {deals.length === 0 ? (
          <p className="py-8 text-center text-sm text-steel">No hot deals right now. Score your pipeline to surface them.</p>
        ) : (
          <ul className="divide-y divide-mist">
            {deals.map((d) => (
              <li key={d.id}>
                <Link href={`/pipeline`} className="group flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink group-hover:underline">{d.title}</p>
                    <p className="truncate text-xs text-steel">{d.company.name}</p>
                  </div>
                  <span className="font-mono text-[13px] font-medium text-ink tnum">{formatINR(d.value)}</span>
                  <Badge tone={d.stage === "NEGOTIATION" ? "hazard" : "signal"}>
                    {STAGE_META[d.stage].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
