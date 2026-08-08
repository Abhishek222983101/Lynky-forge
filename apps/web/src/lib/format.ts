/** Indian-format money: 4800000 -> "₹48,00,000" */
export function formatINR(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** Compact axis notation: 4800000 -> "₹48L" */
export function formatAxisINR(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${Math.round(value / 1_00_000)}L`;
  if (value >= 1_000) return `₹${Math.round(value / 1_000)}k`;
  return `₹${Math.round(value)}`;
}

/** "3d", "2w", "1mo" — compact age */
export function compactAge(from: string | Date): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));
  if (days >= 60) return `${Math.floor(days / 30)}mo`;
  if (days >= 14) return `${Math.floor(days / 7)}w`;
  return `${days}d`;
}

/** "2 days ago", "in 3 days" */
export function relativeDate(date: string | Date): string {
  const d = new Date(date);
  const diffMs = d.getTime() - Date.now();
  const absDays = Math.round(Math.abs(diffMs) / 86_400_000);
  if (absDays === 0) return "today";
  if (absDays === 1) return diffMs < 0 ? "yesterday" : "tomorrow";
  if (absDays < 30) return diffMs < 0 ? `${absDays} days ago` : `in ${absDays} days`;
  const months = Math.round(absDays / 30);
  return diffMs < 0 ? `${months}mo ago` : `in ${months}mo`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Chart axis: "2026-07-12" -> "12 Jul" */
export function shortDay(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
