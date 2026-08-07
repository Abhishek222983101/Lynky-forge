import { z } from "zod";
import { accountingExportCreateSchema } from "@/modules/accounting/accounting.schemas";
import { buybackItemCreateSchema } from "@/modules/buyback/buyback.schemas";
import { customerCreateSchema } from "@/modules/customers/customers.schemas";
import { repairCreateSchema, repairStatusUpdateSchema } from "@/modules/repairs/repairs.schemas";
import { manualSaleSchema } from "@/modules/sales/sales.schemas";
import { schemeCreateSchema, schemeInstallmentSchema } from "@/modules/schemes/schemes.schemas";
import { opsVoiceActionMetadata, opsVoiceActionNames, opsVoiceActionSchemas } from "./ops.voice-actions";

// Core (platform) actions. Per-owner actions are composed in from their own
// registries (ops.voice-actions.ts for Amaan) so owners do not edit this block.
const coreVoiceActionNames = [
  "lookup",
  "record_sale_draft",
  "ask_owner_cockpit",
  "stock_summary",
  "create_customer",
  "create_repair_order",
  "update_repair_status",
  "create_scheme",
  "record_scheme_installment",
  "create_buyback_item",
  "generate_invoice_pdf",
  "export_accounting_file"
] as const;

/** The read-only entities the generic lookup tool can search. */
export const lookupEntities = ["customer", "inventory", "sale", "repair", "scheme"] as const;
export type LookupEntity = typeof lookupEntities[number];

export const voiceActionNames = [...coreVoiceActionNames, ...opsVoiceActionNames] as const;

export type VoiceActionName = typeof voiceActionNames[number];

const coreVoiceActionSchemas = {
  lookup: z.object({
    entity: z.enum(lookupEntities),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(20).optional()
  }),
  record_sale_draft: manualSaleSchema,
  ask_owner_cockpit: z.object({
    question: z.string().min(1),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    customerId: z.string().uuid().optional()
  }),
  stock_summary: z.object({}),
  create_customer: customerCreateSchema,
  create_repair_order: repairCreateSchema,
  update_repair_status: z.object({
    repairOrderId: z.string().uuid()
  }).merge(repairStatusUpdateSchema),
  create_scheme: schemeCreateSchema,
  record_scheme_installment: z.object({
    schemeId: z.string().uuid()
  }).merge(schemeInstallmentSchema),
  create_buyback_item: buybackItemCreateSchema,
  generate_invoice_pdf: z.object({
    invoiceId: z.string().uuid()
  }),
  export_accounting_file: accountingExportCreateSchema
} satisfies Record<(typeof coreVoiceActionNames)[number], z.ZodTypeAny>;

export const voiceActionSchemas = {
  ...coreVoiceActionSchemas,
  ...opsVoiceActionSchemas
} satisfies Record<VoiceActionName, z.ZodTypeAny>;

/**
 * Entities a router utterance may reference by natural language (a name or a
 * document number) that the resolver must turn into a concrete UUID before the
 * command bus can execute the action. The resolver is the one shared touch-point
 * owners extend: Amaan adds karigar, karigar_job, inventory_item.
 */
export type VoiceEntityRef =
  | "customer"
  | "repair"
  | "scheme"
  | "invoice"
  | "karigar"
  | "karigar_job"
  | "inventory_item";

export type VoiceActionMetadata = {
  description: string;
  requiresConfirmation: boolean;
  sensitiveFields: string[];
  /** Natural-language guide the LLM router uses to fill this action's arguments. */
  argumentGuide: string;
  /** Natural references the resolver must turn into UUIDs before execution. */
  resolves: VoiceEntityRef[];
};

const coreVoiceActionMetadata: Record<(typeof coreVoiceActionNames)[number], VoiceActionMetadata> = {
  lookup: {
    description: "Read-only search of the shop's records to answer any 'show me / find / how many / who' question. Use for a customer's details, a stock item, a past sale, a repair, or a scheme. Never writes anything.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "entity: one of customer|inventory|sale|repair|scheme; search: the name, phone, number, or keywords the shopkeeper said; limit: optional count.",
    resolves: []
  },
  record_sale_draft: {
    description: "Create a confirmed sale, payment, pending payment, invoice, audit log, and stock events after explicit confirmation.",
    requiresConfirmation: true,
    sensitiveFields: ["purity", "grossWeight", "netWeight", "goldRatePerGram", "makingChargeValue", "amountPaid", "gstAmount", "pendingAmount"],
    argumentGuide: "customer:{name,phone}; items:[{itemName,purity like 22K,grossWeight in grams,netWeight in grams,makingChargeValue as percent,huidNumber}]; payment:{amountPaid,paymentMethod one of cash|upi|card|bank_transfer}. Do NOT invent the gold rate; the system fills it.",
    resolves: []
  },
  ask_owner_cockpit: {
    description: "Answer an owner cockpit question about sales, cash, pending payments, schemes or stock from database records.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "question: the owner's question verbatim.",
    resolves: []
  },
  stock_summary: {
    description: "Return inventory summary counts and estimated value.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "no arguments.",
    resolves: []
  },
  create_customer: {
    description: "Create a customer profile.",
    requiresConfirmation: true,
    sensitiveFields: ["fullName", "phone"],
    argumentGuide: "fullName; phone; customerType retail|wholesale; preferredLanguage.",
    resolves: []
  },
  create_repair_order: {
    description: "Create a repair or custom order for an existing customer.",
    requiresConfirmation: true,
    sensitiveFields: ["customerId", "itemDescription", "expectedDate"],
    argumentGuide: "customerName and/or customerPhone to identify the customer; itemDescription; purity; expectedDate.",
    resolves: ["customer"]
  },
  update_repair_status: {
    description: "Move a repair order to another status (received, in_workshop, ready, delivered).",
    requiresConfirmation: true,
    sensitiveFields: ["repairOrderId", "status"],
    argumentGuide: "repairOrderNumber, or customerName to pick that customer's latest open repair; status one of received|in_workshop|ready|delivered; notes.",
    resolves: ["repair"]
  },
  create_scheme: {
    description: "Create a savings scheme record. Sornam records the scheme only and does not hold customer money.",
    requiresConfirmation: true,
    sensitiveFields: ["customerId", "monthlyAmount", "months", "maturityDate"],
    argumentGuide: "customerName and/or customerPhone; monthlyAmount; months as an integer; startDate.",
    resolves: ["customer"]
  },
  record_scheme_installment: {
    description: "Record a savings scheme installment payment.",
    requiresConfirmation: true,
    sensitiveFields: ["schemeId", "amount", "paymentMethod"],
    argumentGuide: "schemeNumber, or customerName to pick that customer's active scheme; amount; paymentMethod cash|upi|card|bank_transfer.",
    resolves: ["scheme"]
  },
  create_buyback_item: {
    description: "Record old gold or silver buyback item with tested purity, weight, rate, and calculated value.",
    requiresConfirmation: true,
    sensitiveFields: ["testedPurity", "assignedPurity", "weight", "ratePerGram", "expectedValue"],
    argumentGuide: "itemName; testedPurity like 22K; assignedPurity; weight in grams; ratePerGram; optional customerName/customerPhone of the seller.",
    resolves: ["customer"]
  },
  generate_invoice_pdf: {
    description: "Generate the PDF for an existing invoice.",
    requiresConfirmation: false,
    sensitiveFields: [],
    argumentGuide: "invoiceNumber, or customerName to pick that customer's latest invoice.",
    resolves: ["invoice"]
  },
  export_accounting_file: {
    description: "Generate accounting export files for supported accounting systems.",
    requiresConfirmation: true,
    sensitiveFields: ["provider", "exportType", "dateFrom", "dateTo"],
    argumentGuide: "provider tally|vyapar|busy|zoho_books; exportType; dateFrom; dateTo.",
    resolves: []
  }
};

export const voiceActionMetadata: Record<VoiceActionName, VoiceActionMetadata> = {
  ...coreVoiceActionMetadata,
  ...opsVoiceActionMetadata
};

export function voiceActionList() {
  return voiceActionNames.map((name) => ({
    name,
    description: voiceActionMetadata[name].description,
    requiresConfirmation: voiceActionMetadata[name].requiresConfirmation,
    sensitiveFields: voiceActionMetadata[name].sensitiveFields,
    argumentGuide: voiceActionMetadata[name].argumentGuide
  }));
}
