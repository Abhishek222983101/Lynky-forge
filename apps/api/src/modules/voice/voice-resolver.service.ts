import { Injectable } from "@nestjs/common";
import { KarigarJobStatus, RepairOrderStatus, SavingsSchemeStatus } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { VoiceActionName, VoiceEntityRef, voiceActionMetadata } from "./voice-actions";

/** A pick-one list the UI can render as a chooser; the id continues the flow. */
export type ChooseOption = { id: string; label: string; sublabel?: string };

export type ResolutionResult =
  | { ok: true; arguments: Record<string, unknown> }
  | { ok: false; clarification: string; choose?: { ref: "customer"; options: ChooseOption[] } };

type CustomerMatch =
  | { status: "found"; id: string; name: string }
  | { status: "none" }
  | { status: "ambiguous"; options: Array<{ id: string; name: string; phone: string | null }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns natural references in router arguments (a name, a document number) into
 * the concrete UUIDs the command bus needs. A jeweller says "Lakshmi's repair",
 * never a UUID - this stage bridges that gap and asks a clarifying question when
 * a reference is ambiguous or missing, before any write is proposed.
 */
@Injectable()
export class VoiceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(action: VoiceActionName, args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    const resolved: Record<string, unknown> = { ...args };
    for (const ref of voiceActionMetadata[action].resolves) {
      const result = await this.resolveEntity(ref, action, resolved, shopId);
      if (!result.ok) return result;
    }
    return { ok: true, arguments: resolved };
  }

  private async resolveEntity(ref: VoiceEntityRef, action: VoiceActionName, args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    switch (ref) {
      case "customer":
        return this.resolveCustomerRef(action, args, shopId);
      case "repair":
        return this.resolveRepairRef(args, shopId);
      case "scheme":
        return this.resolveSchemeRef(args, shopId);
      case "invoice":
        return this.resolveInvoiceRef(args, shopId);
      case "karigar":
        return this.resolveKarigarRef(args, shopId);
      case "karigar_job":
        return this.resolveKarigarJobRef(args, shopId);
      case "inventory_item":
        return this.resolveInventoryItemRef(args, shopId);
      default:
        return { ok: true, arguments: args };
    }
  }

  /** Resolve a karigar (goldsmith) by name into karigarId. */
  private async resolveKarigarRef(args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.karigarId)) return { ok: true, arguments: args };
    const name = this.str(args.karigarName);
    if (!name) return { ok: false, clarification: "Which karigar? Please say the goldsmith's name." };
    const matches = await this.prisma.karigar.findMany({
      where: { shopId, isActive: true, name: { contains: name, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    if (matches.length === 0) return { ok: false, clarification: `I could not find a karigar named ${name}.` };
    if (matches.length > 1) return { ok: false, clarification: `More than one karigar matches ${name}: ${matches.map((k) => k.name).join(", ")}. Which one?` };
    args.karigarId = matches[0].id;
    return { ok: true, arguments: args };
  }

  /** Resolve the karigar's latest open job into jobId (and stash issuedWeight for the read-back). */
  private async resolveKarigarJobRef(args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.jobId)) return { ok: true, arguments: args };
    const karigar = await this.resolveKarigarRef(args, shopId);
    if (!karigar.ok) return karigar;
    const job = await this.prisma.karigarJob.findFirst({
      where: { shopId, karigarId: args.karigarId as string, status: { in: [KarigarJobStatus.open, KarigarJobStatus.partially_returned] } },
      orderBy: { issuedDate: "desc" }
    });
    if (!job) return { ok: false, clarification: "I could not find an open job for that karigar." };
    args.jobId = job.id;
    args.issuedWeight = job.issuedWeight.toString();
    args.itemDescription = job.itemDescription;
    return { ok: true, arguments: args };
  }

  /** Resolve an inventory item by SKU or name into inventoryItemId. */
  private async resolveInventoryItemRef(args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.inventoryItemId)) return { ok: true, arguments: args };
    const sku = this.str(args.sku);
    const name = this.str(args.itemName) ?? this.str(args.inventoryItemName);
    let item = sku ? await this.prisma.inventoryItem.findFirst({ where: { shopId, sku } }) : null;
    if (!item && name) {
      const matches = await this.prisma.inventoryItem.findMany({
        where: { shopId, name: { contains: name, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 5
      });
      if (matches.length > 1) return { ok: false, clarification: `More than one item matches ${name}. Please say the SKU.` };
      item = matches[0] ?? null;
    }
    if (!item) return { ok: false, clarification: "Which inventory item? Please say the SKU or item name." };
    args.inventoryItemId = item.id;
    return { ok: true, arguments: args };
  }

  private async resolveCustomerRef(action: VoiceActionName, args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.customerId)) return { ok: true, arguments: args };
    const name = this.str(args.customerName);
    const phone = this.str(args.customerPhone);

    // Buyback allows an anonymous seller - only resolve when a reference was spoken.
    if (!name && !phone) {
      if (action === "create_buyback_item") return { ok: true, arguments: args };
      return { ok: false, clarification: "Which customer is this for? Please say their name or phone number." };
    }

    const match = await this.findCustomer(shopId, name, phone);
    if (match.status === "none") {
      return { ok: false, clarification: `I could not find a customer matching ${name ?? phone}. Please add the customer first or repeat the name.` };
    }
    if (match.status === "ambiguous") {
      return {
        ok: false,
        clarification: `I found more than one customer for ${name}: ${this.describeOptions(match.options)}. Which one?`,
        choose: {
          ref: "customer",
          options: match.options.map((o) => ({ id: o.id, label: o.name, sublabel: o.phone ? `ending ${o.phone.slice(-4)}` : undefined }))
        }
      };
    }
    args.customerId = match.id;
    return { ok: true, arguments: args };
  }

  private async resolveRepairRef(args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.repairOrderId)) return { ok: true, arguments: args };
    const orderNumber = this.str(args.repairOrderNumber);
    if (orderNumber) {
      const order = await this.prisma.repairOrder.findFirst({ where: { shopId, orderNumber } });
      if (!order) return { ok: false, clarification: `I could not find repair order ${orderNumber}.` };
      args.repairOrderId = order.id;
      return { ok: true, arguments: args };
    }

    const customer = await this.requireCustomer(args, shopId, "repair");
    if (!customer.ok) return customer;
    const order = await this.prisma.repairOrder.findFirst({
      where: { shopId, customerId: customer.id, status: { not: RepairOrderStatus.delivered } },
      orderBy: { createdAt: "desc" }
    });
    if (!order) return { ok: false, clarification: `I could not find an open repair order for ${customer.name}.` };
    args.repairOrderId = order.id;
    return { ok: true, arguments: args };
  }

  private async resolveSchemeRef(args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.schemeId)) return { ok: true, arguments: args };
    const schemeNumber = this.str(args.schemeNumber);
    if (schemeNumber) {
      const scheme = await this.prisma.savingsScheme.findFirst({ where: { shopId, schemeNumber } });
      if (!scheme) return { ok: false, clarification: `I could not find scheme ${schemeNumber}.` };
      args.schemeId = scheme.id;
      return { ok: true, arguments: args };
    }

    const customer = await this.requireCustomer(args, shopId, "scheme");
    if (!customer.ok) return customer;
    const scheme = await this.prisma.savingsScheme.findFirst({
      where: { shopId, customerId: customer.id, status: SavingsSchemeStatus.active },
      orderBy: { createdAt: "desc" }
    });
    if (!scheme) return { ok: false, clarification: `I could not find an active scheme for ${customer.name}.` };
    args.schemeId = scheme.id;
    return { ok: true, arguments: args };
  }

  private async resolveInvoiceRef(args: Record<string, unknown>, shopId: string): Promise<ResolutionResult> {
    if (this.isUuid(args.invoiceId)) return { ok: true, arguments: args };
    const invoiceNumber = this.str(args.invoiceNumber);
    if (invoiceNumber) {
      const invoice = await this.prisma.invoice.findFirst({ where: { shopId, invoiceNumber } });
      if (!invoice) return { ok: false, clarification: `I could not find invoice ${invoiceNumber}.` };
      args.invoiceId = invoice.id;
      return { ok: true, arguments: args };
    }

    const customer = await this.requireCustomer(args, shopId, "invoice");
    if (!customer.ok) return customer;
    const invoice = await this.prisma.invoice.findFirst({
      where: { shopId, sale: { customerId: customer.id } },
      orderBy: { createdAt: "desc" }
    });
    if (!invoice) return { ok: false, clarification: `I could not find an invoice for ${customer.name}.` };
    args.invoiceId = invoice.id;
    return { ok: true, arguments: args };
  }

  /** Resolve the customer referenced by name/phone, or return a clarification. */
  private async requireCustomer(args: Record<string, unknown>, shopId: string, subject: string): Promise<{ ok: true; id: string; name: string } | { ok: false; clarification: string }> {
    const name = this.str(args.customerName);
    const phone = this.str(args.customerPhone);
    if (!name && !phone) {
      return { ok: false, clarification: `Whose ${subject} do you mean? Please say the customer's name.` };
    }
    const match = await this.findCustomer(shopId, name, phone);
    if (match.status === "none") return { ok: false, clarification: `I could not find a customer matching ${name ?? phone}.` };
    if (match.status === "ambiguous") return { ok: false, clarification: `More than one customer matches ${name}: ${this.describeOptions(match.options)}. Which one?` };
    return { ok: true, id: match.id, name: match.name };
  }

  private async findCustomer(shopId: string, name: string | null, phone: string | null): Promise<CustomerMatch> {
    if (phone) {
      const byPhone = await this.prisma.customer.findFirst({ where: { shopId, phone } });
      if (byPhone) return { status: "found", id: byPhone.id, name: byPhone.fullName };
    }
    if (!name) return { status: "none" };
    const matches = await this.prisma.customer.findMany({
      where: { shopId, fullName: { contains: name, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    if (matches.length === 0) return { status: "none" };
    if (matches.length === 1) return { status: "found", id: matches[0].id, name: matches[0].fullName };
    return { status: "ambiguous", options: matches.map((customer) => ({ id: customer.id, name: customer.fullName, phone: customer.phone })) };
  }

  private describeOptions(options: Array<{ name: string; phone: string | null }>): string {
    return options
      .map((option) => (option.phone ? `${option.name} (ending ${option.phone.slice(-4)})` : option.name))
      .join(", ");
  }

  private isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_RE.test(value);
  }

  private str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
