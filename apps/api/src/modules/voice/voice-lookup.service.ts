import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/common/database/prisma.service";
import { LookupEntity } from "./voice-actions";

/** A row the agent can speak about and the UI can render as a card. */
export type LookupRow = {
  id: string;
  title: string;
  subtitle?: string;
  fields: Array<{ label: string; value: string }>;
};

export type LookupResult = {
  entity: LookupEntity;
  count: number;
  rows: LookupRow[];
};

const money = (v: unknown) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(v ?? 0));

// Ignore words that carry no filtering signal, so "gold chains in stock" filters
// on "gold"/"chains" and not on "in"/"stock"/"the".
const STOP = new Set(["the", "a", "an", "in", "of", "for", "any", "some", "all", "our", "we", "have", "stock", "shop", "right", "now", "still", "with", "and", "or", "me", "show", "which", "do", "does", "list", "find"]);

/**
 * Tokenised OR-match: a row matches if ANY meaningful word appears in ANY of the
 * given columns. This turns natural phrases ("gold chains", "22 carat bangle")
 * into useful filters instead of a single literal contains that silently misses.
 */
function textFilter(search: string | undefined, columns: string[]): any | undefined {
  if (!search) return undefined;
  const words = search.toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length > 1 && !STOP.has(w));
  if (words.length === 0) return undefined;
  const or: any[] = [];
  for (const word of words) for (const col of columns) or.push({ [col]: { contains: word, mode: "insensitive" } });
  return { OR: or };
}

/**
 * The one flexible, read-only capability behind the `lookup` tool. Every query is
 * shop-scoped and hits only whitelisted columns, so the agent can freely answer
 * "find / show / how many" questions without a bespoke action per phrase and
 * without any way to write to the ledger.
 */
@Injectable()
export class VoiceLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async run(entity: LookupEntity, shopId: string, search?: string, limit = 8): Promise<LookupResult> {
    const take = Math.min(Math.max(limit, 1), 20);
    const rows = await this.query(entity, shopId, search?.trim() || undefined, take);
    return { entity, count: rows.length, rows };
  }

  private async query(entity: LookupEntity, shopId: string, search: string | undefined, take: number): Promise<LookupRow[]> {
    switch (entity) {
      case "customer": {
        const where: any = { shopId, ...textFilter(search, ["fullName", "phone"]) };
        const items = await this.prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, take });
        return items.map((c) => ({
          id: c.id,
          title: c.fullName,
          subtitle: c.phone ?? undefined,
          fields: [
            { label: "Type", value: String(c.customerType) },
            ...(c.phone ? [{ label: "Phone", value: c.phone }] : [])
          ]
        }));
      }
      case "inventory": {
        const where: any = { shopId, ...textFilter(search, ["name", "sku", "category", "purity"]) };
        const items = await this.prisma.inventoryItem.findMany({ where, orderBy: { createdAt: "desc" }, take });
        return items.map((i) => ({
          id: i.id,
          title: i.name,
          subtitle: [i.purity, i.category].filter(Boolean).join(" · ") || undefined,
          fields: [
            { label: "Weight", value: `${i.grossWeight ?? "-"} g` },
            { label: "Value", value: money(i.estimatedValue) },
            { label: "Status", value: String(i.status) }
          ]
        }));
      }
      case "sale": {
        const items = await this.prisma.sale.findMany({
          where: { shopId },
          orderBy: { createdAt: "desc" },
          take,
          include: { invoice: true, customer: true }
        });
        return items.map((s) => ({
          id: s.id,
          title: s.saleNumber ?? "Sale",
          subtitle: s.customer?.fullName ?? undefined,
          fields: [
            { label: "Total", value: money(s.totalAmount) },
            ...(s.invoice ? [{ label: "Invoice", value: s.invoice.invoiceNumber }] : [])
          ]
        }));
      }
      case "repair": {
        const where: any = { shopId, ...textFilter(search, ["orderNumber", "itemDescription"]) };
        const items = await this.prisma.repairOrder.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { customer: true } });
        return items.map((r) => ({
          id: r.id,
          title: r.orderNumber ?? "Repair",
          subtitle: r.customer?.fullName ?? undefined,
          fields: [
            { label: "Item", value: r.itemDescription ?? "-" },
            { label: "Status", value: String(r.status).replace(/_/g, " ") }
          ]
        }));
      }
      case "scheme": {
        const items = await this.prisma.savingsScheme.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take, include: { customer: true } });
        return items.map((s) => ({
          id: s.id,
          title: s.schemeNumber ?? "Scheme",
          subtitle: s.customer?.fullName ?? undefined,
          fields: [
            { label: "Monthly", value: money(s.monthlyAmount) },
            { label: "Status", value: String(s.status) }
          ]
        }));
      }
      default:
        return [];
    }
  }
}
