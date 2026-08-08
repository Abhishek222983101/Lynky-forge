import { cn } from "@/lib/cn";

export interface TitleBlockData {
  partNo: string | null;
  material: string | null;
  qty: number | null;
  tolerance: string | null;
  rev: string;
  drawnBy: string;
  date: string;
}

/**
 * Engineering title-block — the signature element (PRD §7.4).
 * 2-col × 3-row grid, mono font, hairline border. No decoration.
 */
export function TitleBlock({ data, className }: { data: TitleBlockData; className?: string }) {
  const cells: { label: string; value: string }[] = [
    { label: "PART NO", value: data.partNo ?? "—" },
    { label: "MATERIAL", value: data.material ?? "—" },
    { label: "QTY", value: data.qty !== null ? data.qty.toLocaleString("en-IN") : "—" },
    { label: "TOLERANCE", value: data.tolerance ?? "—" },
    { label: "REV", value: data.rev },
    { label: "DRAWN BY", value: `${data.drawnBy} / ${data.date}` },
  ];

  return (
    <div className={cn("overflow-hidden rounded-xl border border-mist bg-surface", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className={cn(
              "flex items-baseline gap-3 border-mist px-5 py-3.5",
              i % 2 === 0 && "sm:border-r",
              i < 4 ? "border-b" : i === 4 ? "border-b sm:border-b-0" : ""
            )}
          >
            <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-steel">
              {c.label}:
            </span>
            <span className="truncate font-mono text-[13px] font-medium text-ink tnum">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
