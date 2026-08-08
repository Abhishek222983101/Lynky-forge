import Link from "next/link";
import { RfqForm } from "@/components/rfqs/rfq-form";

export default function NewRfqPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/rfqs" className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel hover:text-ink">
          ← RFQs
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Capture RFQ</h1>
        <p className="mt-1 text-sm text-steel">
          Logs the request, creates the company if new, and opens a deal in the pipeline.
        </p>
      </div>
      <RfqForm />
    </div>
  );
}
