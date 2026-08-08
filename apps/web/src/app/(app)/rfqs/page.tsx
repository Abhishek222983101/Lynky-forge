"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { RfqTable } from "@/components/rfqs/rfq-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRfqs } from "@/hooks/use-rfqs";

export default function RfqsPage() {
  const { data, isLoading, isError, refetch } = useRfqs();
  const rfqs = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">RFQs</h1>
          <p className="font-mono text-xs text-steel tnum">{data?.total ?? 0} captured</p>
        </div>
        <Link href="/rfqs/new">
          <Button size="md">
            <Plus className="size-4" strokeWidth={2} />
            New RFQ
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </Card>
      ) : isError ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">RFQs didn&apos;t load.</p>
          <p className="mt-1 text-sm text-steel">Check that the API is running, then retry.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90"
          >
            Retry
          </button>
        </Card>
      ) : rfqs.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-ink">No RFQs captured yet.</p>
          <p className="mt-1 text-sm text-steel">
            Every RFQ you quote within 4 hours beats the competitor. Capture the first one.
          </p>
          <Link href="/rfqs/new" className="mt-4 inline-block rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal/90">
            Capture RFQ
          </Link>
        </Card>
      ) : (
        <Card>
          <RfqTable rfqs={rfqs} />
        </Card>
      )}
    </div>
  );
}
