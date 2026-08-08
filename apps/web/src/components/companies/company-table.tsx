"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { INDUSTRY_META, LEAD_SCORE_TONE, type CompanyListItem, type LeadScore } from "@/lib/types";

export interface CompanyRowExtras {
  ltv: number;
  hottestScore: LeadScore | null;
}

export function CompanyTable({
  companies,
  extras,
}: {
  companies: CompanyListItem[];
  extras: Map<string, CompanyRowExtras>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-mist">
            <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Company</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Industry</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">City</th>
            <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Contact</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Deals</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Won Value</th>
            <th className="px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Score</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const ex = extras.get(c.id);
            const primary = c.contacts.find((ct) => ct.isPrimary) ?? c.contacts[0] ?? null;
            return (
              <tr key={c.id} className="group border-b border-mist/70 transition-colors last:border-0 hover:bg-canvas">
                <td className="px-5 py-3.5">
                  <Link href={`/companies/${c.id}`} className="font-medium text-ink underline-offset-4 group-hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone="neutral">{INDUSTRY_META[c.industry]}</Badge>
                </td>
                <td className="px-4 py-3.5 text-steel">{c.city ?? "—"}</td>
                <td className="px-4 py-3.5 text-steel">{primary?.name ?? "—"}</td>
                <td className="px-4 py-3.5 text-right font-mono tnum text-ink">{c._count.deals}</td>
                <td className="px-4 py-3.5 text-right font-mono tnum text-ink">
                  {ex && ex.ltv > 0 ? formatINR(ex.ltv) : "—"}
                </td>
                <td className="px-5 py-3.5">
                  {ex?.hottestScore ? (
                    <Badge tone={LEAD_SCORE_TONE[ex.hottestScore]} mono>
                      {ex.hottestScore}
                    </Badge>
                  ) : (
                    <span className="text-steel">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
