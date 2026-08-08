import { formatINR } from "@/lib/format";
import type { QuoteLineItem } from "@/lib/types";

export function LineItemsTable({ items, total }: { items: QuoteLineItem[]; total: string }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-steel">No line items on this quote.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-mist">
            <th className="px-5 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Description</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Qty</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Unit Price</th>
            <th className="px-5 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((li, i) => (
            <tr key={i} className="border-b border-mist/60 last:border-0 even:bg-canvas/60">
              <td className="px-5 py-3 text-ink">{li.description}</td>
              <td className="px-4 py-3 text-right font-mono text-ink tnum">{li.qty.toLocaleString("en-IN")}</td>
              <td className="px-4 py-3 text-right font-mono text-ink tnum">{formatINR(li.unitPrice)}</td>
              <td className="px-5 py-3 text-right font-mono text-ink tnum">{formatINR(li.qty * li.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-mist">
            <td colSpan={3} className="px-5 py-3.5 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-steel">
              Total
            </td>
            <td className="px-5 py-3.5 text-right font-mono text-base font-semibold text-ink tnum">{formatINR(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
