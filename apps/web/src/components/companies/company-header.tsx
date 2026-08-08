import { Globe, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { INDUSTRY_META, type CompanyDetail } from "@/lib/types";

export function CompanyHeader({ company }: { company: CompanyDetail }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{company.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{INDUSTRY_META[company.industry]}</Badge>
              {company.city ? (
                <span className="inline-flex items-center gap-1 text-[13px] text-steel">
                  <MapPin className="size-3.5" strokeWidth={1.8} />
                  {company.city}
                </span>
              ) : null}
              {company.website ? (
                <a
                  href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] text-info hover:underline"
                >
                  <Globe className="size-3.5" strokeWidth={1.8} />
                  {company.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
          </div>
          {company.annualPotential ? (
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel">Annual potential</p>
              <p className="mt-0.5 font-mono text-lg font-medium text-ink tnum">{formatINR(company.annualPotential)}</p>
            </div>
          ) : null}
        </div>
        {company.notes ? <p className="border-t border-mist pt-3 text-sm text-steel">{company.notes}</p> : null}
      </CardBody>
    </Card>
  );
}
