"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ActivityTimeline } from "@/components/companies/activity-timeline";
import { CompanyHeader } from "@/components/companies/company-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-companies";
import { cn } from "@/lib/cn";
import { compactAge, formatINR } from "@/lib/format";
import { OPEN_STAGES, STAGE_META, type DealStage } from "@/lib/types";

type Tab = "overview" | "deals" | "activity";

const STAGE_TONE: Record<DealStage, "signal" | "hazard" | "steel" | "info" | "neutral"> = {
  NEW_RFQ: "steel",
  CONTACTED: "info",
  QUOTE_SENT: "info",
  NEGOTIATION: "neutral",
  WON: "signal",
  LOST: "hazard",
};

export default function Company360Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: company, isLoading, isError, refetch } = useCompany(id);
  const [tab, setTab] = useState<Tab>("overview");

  const stats = useMemo(() => {
    const deals = company?.deals ?? [];
    const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const won = deals.filter((d) => d.stage === "WON");
    return {
      total: deals.length,
      openValue: open.reduce((s, d) => s + (parseFloat(d.value) || 0), 0),
      wonCount: won.length,
      wonValue: won.reduce((s, d) => s + (parseFloat(d.value) || 0), 0),
    };
  }, [company?.deals]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium text-ink">Company didn&apos;t load.</p>
        <p className="mt-1 text-sm text-steel">It may have been deleted, or the API is unreachable.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button onClick={() => refetch()} className="rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90">
            Retry
          </button>
          <Link href="/companies" className="rounded-lg border border-mist bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas">
            Back to companies
          </Link>
        </div>
      </Card>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "deals", label: "Deals", count: company.deals?.length ?? 0 },
    { key: "activity", label: "Activity", count: company.activities?.length ?? 0 },
  ];

  return (
    <div className="space-y-5">
      <Link href="/companies" className="inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-steel hover:text-ink">
        ← Companies
      </Link>

      <CompanyHeader company={company} />

      <div className="flex gap-1 border-b border-mist">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-signal text-ink" : "border-transparent text-steel hover:text-ink"
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1.5 font-mono text-[11px] text-steel tnum">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Key stats</CardTitle></CardHeader>
            <CardBody className="grid grid-cols-2 gap-4">
              <Stat label="Total deals" value={String(stats.total)} />
              <Stat label="Open pipeline" value={formatINR(stats.openValue)} />
              <Stat label="Won deals" value={String(stats.wonCount)} />
              <Stat label="Won value" value={formatINR(stats.wonValue)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
            <CardBody>
              {company.contacts.length === 0 ? (
                <p className="text-sm text-steel">No contacts yet.</p>
              ) : (
                <ul className="divide-y divide-mist">
                  {company.contacts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {c.name}
                          {c.isPrimary ? <Badge tone="signal" className="ml-2">Primary</Badge> : null}
                        </p>
                        <p className="truncate text-xs text-steel">{[c.role, c.email ?? c.phone].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "deals" ? (
        <Card>
          {(company.deals ?? []).length === 0 ? (
            <CardBody className="py-10 text-center">
              <p className="text-sm text-steel">No deals with this company yet.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-mist">
                    <Th>Deal</Th>
                    <Th>Stage</Th>
                    <Th>Quote</Th>
                    <Th className="text-right">Value</Th>
                    <Th>Age</Th>
                  </tr>
                </thead>
                <tbody>
                  {(company.deals ?? []).map((d) => (
                    <tr key={d.id} className="border-b border-mist/70 last:border-0 hover:bg-canvas">
                      <td className="px-5 py-3 font-medium text-ink">{d.title}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STAGE_TONE[d.stage]}>{STAGE_META[d.stage].label}</Badge>
                        {d.stage === "LOST" && d.lostReason ? (
                          <p className="mt-1 text-[11px] text-hazard">{d.lostReason}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {d.quote ? (
                          <Link href={`/quotes/${d.quote.id}`} className="font-mono text-[13px] text-info tnum hover:underline">
                            {d.quote.quoteNo}
                          </Link>
                        ) : (
                          <span className="text-steel">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tnum text-ink">{formatINR(d.value)}</td>
                      <td className="px-5 py-3 font-mono text-[12px] text-steel tnum">±{compactAge(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <CardBody>
            <ActivityTimeline activities={company.activities ?? []} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel">{label}</p>
      <p className="mt-1 font-mono text-xl font-medium text-ink tnum">{value}</p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel first:px-5 last:px-5", className)}>
      {children}
    </th>
  );
}
