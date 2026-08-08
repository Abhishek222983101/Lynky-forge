"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CompanyTable, type CompanyRowExtras } from "@/components/companies/company-table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies } from "@/hooks/use-companies";
import { useDeals } from "@/hooks/use-deals";
import { cn } from "@/lib/cn";
import { INDUSTRY_META, OPEN_STAGES, type Industry, type LeadScore } from "@/lib/types";

const INDUSTRIES = Object.keys(INDUSTRY_META) as Industry[];
const SCORE_RANK: Record<LeadScore, number> = { HOT: 3, WARM: 2, COLD: 1 };

export default function CompaniesPage() {
  const companies = useCompanies();
  const deals = useDeals();
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<Industry | null>(null);

  /** Join deals client-side: won value (LTV) + hottest open-deal score per company */
  const extras = useMemo(() => {
    const map = new Map<string, CompanyRowExtras>();
    for (const d of deals.data?.data ?? []) {
      const cur = map.get(d.company.id) ?? { ltv: 0, hottestScore: null };
      if (d.stage === "WON") cur.ltv += parseFloat(d.value) || 0;
      if (OPEN_STAGES.includes(d.stage)) {
        const best = cur.hottestScore;
        if (!best || SCORE_RANK[d.leadScore] > SCORE_RANK[best]) cur.hottestScore = d.leadScore;
      }
      map.set(d.company.id, cur);
    }
    return map;
  }, [deals.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (companies.data ?? []).filter((c) => {
      if (industry && c.industry !== industry) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.city ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies.data, query, industry]);

  const isLoading = companies.isLoading || deals.isLoading;
  const isError = companies.isError || deals.isError;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Companies</h1>
        <p className="font-mono text-xs text-steel tnum">{filtered.length} of {companies.data?.length ?? 0}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" strokeWidth={1.8} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or city…"
            className="pl-9"
            aria-label="Search companies"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={industry === null} onClick={() => setIndustry(null)}>All</FilterChip>
          {INDUSTRIES.map((ind) => (
            <FilterChip key={ind} active={industry === ind} onClick={() => setIndustry(industry === ind ? null : ind)}>
              {INDUSTRY_META[ind]}
            </FilterChip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">Companies didn&apos;t load.</p>
          <p className="mt-1 text-sm text-steel">Check that the API is running, then retry.</p>
          <button
            onClick={() => {
              companies.refetch();
              deals.refetch();
            }}
            className="mt-4 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90"
          >
            Retry
          </button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">
            {(companies.data?.length ?? 0) === 0 ? "No companies yet." : "No companies match those filters."}
          </p>
          <p className="mt-1 text-sm text-steel">
            {(companies.data?.length ?? 0) === 0
              ? "Capture your first RFQ — the company is created automatically."
              : "Try a different search or industry filter."}
          </p>
        </Card>
      ) : (
        <Card>
          <CompanyTable companies={filtered} extras={extras} />
        </Card>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-signal bg-signal-soft text-signal"
          : "border-mist bg-surface text-steel hover:border-steel/40 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
