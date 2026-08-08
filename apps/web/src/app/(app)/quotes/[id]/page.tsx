"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LineItemsTable } from "@/components/quotes/line-items-table";
import { TitleBlock } from "@/components/quotes/title-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuote, useUpdateQuoteStatus } from "@/hooks/use-quotes";
import { ApiError } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { QUOTE_NEXT_STATUSES, QUOTE_STATUS_META, STAGE_META, type QuoteStatus } from "@/lib/types";

const NEXT_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "",
  SENT: "Mark as Sent",
  ACCEPTED: "Mark Accepted",
  REJECTED: "Mark Rejected",
  EXPIRED: "Mark Expired",
};

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: quote, isLoading, isError, refetch } = useQuote(id);
  const updateStatus = useUpdateQuoteStatus();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium text-ink">Quote didn&apos;t load.</p>
        <p className="mt-1 text-sm text-steel">It may have been deleted, or the API is unreachable.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button onClick={() => refetch()} className="rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90">
            Retry
          </button>
          <Link href="/quotes" className="rounded-lg border border-mist bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas">
            Back to quotes
          </Link>
        </div>
      </Card>
    );
  }

  const rfq = quote.deal.rfq;
  const user = getUser();
  const nextStatuses = QUOTE_NEXT_STATUSES[quote.status];

  function changeStatus(status: QuoteStatus) {
    setNotice(null);
    updateStatus.mutate(
      { id: quote!.id, status },
      {
        onSuccess: (res) => {
          if (status === "SENT" && res.tasksCreated.length > 0) {
            setNotice(`Quote sent — follow-up task created, deal moved to Quote Sent.`);
          } else if (status === "SENT") {
            setNotice("Quote marked as sent.");
          } else {
            setNotice(`Quote marked ${QUOTE_STATUS_META[status].label.toLowerCase()}.`);
          }
        },
      }
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/quotes" className="inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-steel hover:text-ink">
        ← Quotes
      </Link>

      {/* Engineering title-block — the signature */}
      <TitleBlock
        data={{
          partNo: rfq?.partNo ?? null,
          material: rfq?.material ?? null,
          qty: rfq?.qty ?? null,
          tolerance: rfq?.tolerance ?? null,
          rev: "A",
          drawnBy: user?.fullName ?? "—",
          date: formatDate(quote.createdAt),
        }}
      />

      {/* Meta + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-ink tnum">{quote.quoteNo}</h1>
          <Badge tone={QUOTE_STATUS_META[quote.status].tone}>{QUOTE_STATUS_META[quote.status].label}</Badge>
          {quote.aiGenerated ? <Badge tone="signal">AI drafted</Badge> : null}
          <span className="font-mono text-[12px] text-steel tnum">valid until {formatDate(quote.validUntil)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled title="AI drafting ships in Phase 5">
            Draft with AI
          </Button>
          {nextStatuses.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "REJECTED" ? "danger" : "primary"}
              loading={updateStatus.isPending}
              onClick={() => changeStatus(s)}
            >
              {NEXT_LABEL[s]}
            </Button>
          ))}
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-signal/40 bg-signal-soft px-4 py-3 text-sm font-medium text-signal">
          {notice}
        </div>
      ) : null}
      {updateStatus.isError ? (
        <div className="rounded-lg border border-hazard/40 bg-hazard-soft px-4 py-3 text-sm font-medium text-hazard">
          {updateStatus.error instanceof ApiError ? updateStatus.error.message : "Status update failed. Try again."}
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <LineItemsTable items={quote.lineItems ?? []} total={quote.totalAmount} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardBody>
              {quote.terms && quote.terms.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
                  {quote.terms.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-steel">No terms recorded on this quote.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deal</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="font-medium text-ink">{quote.deal.title}</p>
              <p className="mt-1 text-sm text-steel">{quote.deal.company.name}</p>
            </div>
            <div className="flex items-center justify-between border-t border-mist pt-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">Stage</span>
              <Badge tone="neutral">{STAGE_META[quote.deal.stage].label}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">Deal value</span>
              <span className="font-mono text-sm font-medium text-ink tnum">{formatINR(quote.deal.value)}</span>
            </div>
            {quote.deal.contact ? (
              <div className="border-t border-mist pt-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">Contact</p>
                <p className="mt-1 text-sm font-medium text-ink">{quote.deal.contact.name}</p>
                {quote.deal.contact.email ? <p className="text-[13px] text-steel">{quote.deal.contact.email}</p> : null}
              </div>
            ) : null}
            {rfq ? (
              <div className="border-t border-mist pt-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel">RFQ</p>
                <p className="mt-1 text-sm text-ink">{rfq.partName}</p>
                <p className="mt-0.5 font-mono text-[12px] text-steel tnum">
                  {rfq.qty.toLocaleString("en-IN")} pcs · due {formatDate(rfq.deadline)}
                </p>
                {rfq.drawingNotes ? <p className="mt-1.5 text-[13px] text-steel">{rfq.drawingNotes}</p> : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
