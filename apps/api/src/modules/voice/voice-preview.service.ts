import { Injectable } from "@nestjs/common";
import { MakingChargeType, PaymentMethod } from "@prisma/client";
import { AuthUser } from "@/common/types/auth-user";
import { BillingService } from "@/modules/billing/billing.service";
import { GoldRateClient } from "@/modules/integrations/gold-rate/gold-rate.client";
import { ManualSaleDto, manualSaleSchema } from "@/modules/sales/sales.schemas";
import { VoiceActionName, voiceActionMetadata, voiceActionSchemas } from "./voice-actions";

export type PreviewResult =
  | { status: "ready"; confirmationMessage: string; input: unknown }
  | { status: "incomplete"; missingFields: string[] };

/**
 * The grounding stage. For every action it validates the (resolved) arguments
 * against the execution schema - that is the generalized slot-filling: any
 * required field the schema rejects becomes a spoken follow-up question. It then
 * produces the human-readable read-back that the confirm gate speaks before a
 * write. Sales get a richer read-back because they need a live gold rate and GST
 * totals computed first.
 */
@Injectable()
export class VoicePreviewService {
  constructor(
    private readonly billing: BillingService,
    private readonly goldRate: GoldRateClient
  ) {}

  async build(action: VoiceActionName, args: Record<string, unknown>, actor: AuthUser): Promise<PreviewResult> {
    if (action === "record_sale_draft") {
      return this.buildSalePreview(args, actor);
    }

    const parsed = voiceActionSchemas[action].safeParse(args);
    if (!parsed.success) {
      const missingFields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "value"))];
      return { status: "incomplete", missingFields };
    }
    return { status: "ready", confirmationMessage: this.renderMessage(action, parsed.data, args), input: parsed.data };
  }

  private async buildSalePreview(args: Record<string, unknown>, actor: AuthUser): Promise<PreviewResult> {
    const rawItems = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [];
    if (rawItems.length === 0) return { status: "incomplete", missingFields: ["items"] };

    const missing = new Set<string>();
    for (const item of rawItems) {
      if (!this.str(item.purity)) missing.add("purity");
      if (!this.str(item.netWeight) && !this.str(item.grossWeight)) missing.add("weight");
    }
    if (missing.size) return { status: "incomplete", missingFields: [...missing] };

    const items = await Promise.all(
      rawItems.map(async (item) => {
        const purity = this.str(item.purity)!;
        const netWeight = this.str(item.netWeight) ?? this.str(item.grossWeight)!;
        const grossWeight = this.str(item.grossWeight) ?? netWeight;
        const rate = await this.goldRate.getCurrentRate(purity, actor.shopId!);
        return {
          itemName: this.str(item.itemName) ?? "item",
          purity,
          grossWeight,
          netWeight,
          goldRatePerGram: rate.ratePerGram.toString(),
          makingChargeType: MakingChargeType.percentage,
          makingChargeValue: this.str(item.makingChargeValue) ?? "0",
          hallmarkingChargeAmount: "0",
          huidNumber: this.str(item.huidNumber) ?? null
        };
      })
    );

    const customer = this.asRecord(args.customer);
    const payment = this.asRecord(args.payment);
    const amountPaid = this.str(payment.amountPaid) ?? "0";
    const paymentMethod = this.paymentMethod(payment.paymentMethod);

    const input: ManualSaleDto = manualSaleSchema.parse({
      customer: this.str(customer.name) ? { fullName: this.str(customer.name)!, phone: this.str(customer.phone) ?? undefined } : undefined,
      items,
      amountPaid,
      paymentMethod
    });

    const totals = this.billing.calculateSale({ items: input.items, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod });
    const customerName = input.customer?.fullName ?? "walk-in customer";
    // Read back EVERY item, not just the first — a multi-item sale is written in
    // full, so the spoken confirmation must reflect all of it. Payment method is
    // stated explicitly so an assumed "cash" is never saved silently.
    const itemsText = input.items
      .map((it) => `${it.purity} ${it.itemName}, ${it.netWeight} grams, making charge ${it.makingChargeValue}%`)
      .join("; ");
    const countPhrase = input.items.length > 1 ? `${input.items.length} items: ` : "";
    const confirmationMessage =
      `I heard ${countPhrase}${itemsText}. Customer ${customerName}. ` +
      `Gold rate used Rs ${input.items[0].goldRatePerGram}/gram. Total is Rs ${totals.totalAmount.toFixed(2)}. ` +
      `Received Rs ${totals.amountPaid.toFixed(2)} by ${input.paymentMethod}. Pending amount Rs ${totals.pendingAmount.toFixed(2)}. Should I save this sale?`;

    return { status: "ready", confirmationMessage, input };
  }

  private renderMessage(action: VoiceActionName, data: any, raw: Record<string, unknown>): string {
    const who = this.str(raw.customerName);
    switch (action) {
      case "ask_owner_cockpit":
        return `Question: ${data.question}`;
      case "stock_summary":
        return "Show the current stock summary.";
      case "create_customer":
        return `Create customer ${data.fullName}${data.phone ? `, phone ${data.phone}` : ""}. Should I save?`;
      case "create_repair_order":
        return `Create a repair order${who ? ` for ${who}` : ""}: ${data.itemDescription}. Should I save?`;
      case "update_repair_status":
        return `Update the repair${who ? ` for ${who}` : ""} to ${data.status.replace(/_/g, " ")}. Should I save?`;
      case "create_scheme":
        return `Create a ${data.months}-month savings scheme of Rs ${data.monthlyAmount} per month${who ? ` for ${who}` : ""}. Should I save?`;
      case "record_scheme_installment":
        return `Record a scheme installment of Rs ${data.amount} by ${data.paymentMethod}${who ? ` for ${who}` : ""}. Should I save?`;
      case "create_buyback_item":
        return `Record buyback item ${data.itemName}: tested ${data.testedPurity}, ${data.weight} grams at Rs ${data.ratePerGram}/gram. Should I save?`;
      case "slow_stock_report":
        return "Report slow-moving stock and stuck cash.";
      case "promote_slow_stock":
        return `Promote up to ${data.limit} slow-moving item(s)${data.occasion ? ` for ${data.occasion}` : ""} by creating content jobs. Should I proceed?`;
      case "issue_karigar_job":
        return `Issue ${data.issuedWeight} grams of ${data.purity} to ${this.str(raw.karigarName) ?? "the karigar"} for ${data.itemDescription}. Should I save?`;
      case "record_karigar_return": {
        const issued = Number(this.str(raw.issuedWeight) ?? 0);
        const finished = Number(data.finishedWeight ?? 0);
        const scrap = Number(data.scrapWeight ?? 0);
        const wastage = (issued - finished - scrap).toFixed(3);
        const desc = this.str(raw.itemDescription);
        return `Record return${desc ? ` for ${desc}` : ""}: ${finished} grams finished, ${scrap} grams scrap. Wastage is ${wastage} grams. Should I save?`;
      }
      case "karigar_scorecard":
        return "Show the karigar's scorecard.";
      case "create_inventory_item":
        return `Add inventory item ${data.name}, ${data.purity}${data.netWeight ? `, ${data.netWeight} grams` : ""}. Should I save?`;
      case "record_stock_movement": {
        const item = this.str(raw.itemName) ?? this.str(raw.sku);
        return `Record a ${String(data.movementType).replace(/_/g, " ")} stock movement${item ? ` for ${item}` : ""}. Should I save?`;
      }
      case "create_content_request": {
        const item = this.str(raw.itemName) ?? this.str(raw.sku);
        return `Create a content request${item ? ` for ${item}` : ""}${data.occasion ? ` for ${data.occasion}` : ""}. Should I save?`;
      }
      case "generate_content_post": {
        const item = this.str(raw.itemName) ?? this.str(raw.sku);
        return `Generate a marketing post${item ? ` for ${item}` : ""}${data.occasion ? ` for ${data.occasion}` : ""}. Should I create it?`;
      }
      case "publish_content_post": {
        const where = Array.isArray(data.platforms) && data.platforms.length
          ? data.platforms.join(" and ")
          : "your connected Instagram and Facebook";
        const when = data.scheduledAt ? ` scheduled for ${new Date(data.scheduledAt).toLocaleString()}` : " now";
        return `Publish your latest approved post to ${where}${when}. Should I go ahead?`;
      }
      case "buyback_summary":
        return "Show the buyback summary.";
      case "create_buyback_bundle":
        return `Create a ${data.metal} buyback bundle at ${data.purity}, Rs ${data.ratePerGram} per gram. Should I save?`;
      case "assign_buyback_items":
        return `Assign ${Array.isArray(data.itemIds) ? data.itemIds.length : 0} item(s) to the bundle. Should I save?`;
      case "update_inventory_status":
        return `Update the item status to ${String(data.status).replace(/_/g, " ")}. Should I save?`;
      case "create_karigar":
        return `Add karigar ${data.name}${data.specialization ? `, ${data.specialization}` : ""}. Should I save?`;
      case "generate_invoice_pdf":
        return "Generate the invoice PDF.";
      case "export_accounting_file":
        return `Export a ${data.exportType} file for ${data.provider}. Should I save?`;
      default:
        return `About to run ${voiceActionMetadata[action].description} Should I proceed?`;
    }
  }

  private paymentMethod(value: unknown): PaymentMethod {
    const candidate = typeof value === "string" ? value.replace(/\s+/g, "_").toLowerCase() : "";
    return (Object.values(PaymentMethod) as string[]).includes(candidate) ? (candidate as PaymentMethod) : PaymentMethod.cash;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  private str(value: unknown): string | null {
    if (typeof value === "number") return String(value);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
