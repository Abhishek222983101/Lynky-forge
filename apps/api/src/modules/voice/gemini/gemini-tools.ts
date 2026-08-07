import { VoiceActionName, voiceActionMetadata, voiceActionNames } from "@/modules/voice/voice-actions";

/**
 * Gemini Live acts as the router: it hears the shopkeeper, picks one of these
 * tools, and fills the arguments. The server then runs the same resolver ->
 * preview -> confirm -> command-bus pipeline the text path uses, so Gemini never
 * writes to the ledger directly. Parameter shapes are intentionally the natural,
 * human fields; the Zod preview stage is the authority on what is actually valid.
 */
type GeminiSchema = {
  type: "OBJECT" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY";
  description?: string;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  enum?: string[];
  required?: string[];
};

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters?: GeminiSchema;
};

const S = (description: string): GeminiSchema => ({ type: "STRING", description });
const NUM = (description: string): GeminiSchema => ({ type: "STRING", description }); // numbers as strings: preserves "22K", "18.5"

const ACTION_PARAMS: Record<VoiceActionName, GeminiSchema | undefined> = {
  lookup: {
    type: "OBJECT",
    properties: {
      entity: { type: "STRING", enum: ["customer", "inventory", "sale", "repair", "scheme"], description: "What to search" },
      search: S("Name, phone, number or keywords the shopkeeper said")
    },
    required: ["entity"]
  },
  stock_summary: undefined,
  ask_owner_cockpit: {
    type: "OBJECT",
    properties: { question: S("The shopkeeper's question, verbatim") },
    required: ["question"]
  },
  create_customer: {
    type: "OBJECT",
    properties: {
      fullName: S("Customer's full name"),
      phone: S("Phone number if given"),
      customerType: { type: "STRING", description: "retail or wholesale", enum: ["retail", "wholesale"] },
      preferredLanguage: S("Preferred language if mentioned")
    },
    required: ["fullName"]
  },
  create_repair_order: {
    type: "OBJECT",
    properties: {
      customerName: S("Name of the existing customer"),
      customerPhone: S("Customer's phone number if given"),
      itemDescription: S("What is being repaired, e.g. gold chain clasp"),
      purity: NUM("Metal purity like 22K if mentioned"),
      expectedDate: S("Expected ready date if mentioned")
    },
    required: ["customerName", "itemDescription"]
  },
  update_repair_status: {
    type: "OBJECT",
    properties: {
      repairOrderNumber: S("Repair order number if the shopkeeper said one"),
      customerName: S("Customer name, to find their latest open repair"),
      status: { type: "STRING", description: "New status", enum: ["received", "in_workshop", "ready", "delivered"] },
      notes: S("Any note about the update")
    },
    required: ["status"]
  },
  create_scheme: {
    type: "OBJECT",
    properties: {
      customerName: S("Customer name"),
      customerPhone: S("Customer phone if given"),
      monthlyAmount: NUM("Monthly savings amount in rupees"),
      months: { type: "INTEGER", description: "Number of months" },
      startDate: S("Start date if mentioned")
    },
    required: ["customerName", "monthlyAmount", "months"]
  },
  record_scheme_installment: {
    type: "OBJECT",
    properties: {
      schemeNumber: S("Scheme number if said"),
      customerName: S("Customer name, to find their active scheme"),
      amount: NUM("Installment amount in rupees"),
      paymentMethod: { type: "STRING", enum: ["cash", "upi", "card", "bank_transfer"], description: "How it was paid" }
    },
    required: ["amount"]
  },
  create_buyback_item: {
    type: "OBJECT",
    properties: {
      itemName: S("The old item, e.g. gold bangle"),
      testedPurity: NUM("Tested purity like 22K"),
      assignedPurity: NUM("Assigned purity if different"),
      weight: NUM("Weight in grams"),
      ratePerGram: NUM("Rate per gram in rupees"),
      customerName: S("Seller's name if given"),
      customerPhone: S("Seller's phone if given")
    },
    required: ["itemName", "testedPurity", "weight", "ratePerGram"]
  },
  generate_invoice_pdf: {
    type: "OBJECT",
    properties: {
      invoiceNumber: S("Invoice number if said"),
      customerName: S("Customer name, to find their latest invoice")
    }
  },
  export_accounting_file: {
    type: "OBJECT",
    properties: {
      provider: { type: "STRING", enum: ["tally", "vyapar", "busy", "zoho_books"], description: "Accounting software" },
      exportType: S("What kind of export"),
      dateFrom: S("Start date"),
      dateTo: S("End date")
    },
    required: ["provider"]
  },
  record_sale_draft: {
    type: "OBJECT",
    properties: {
      customer: {
        type: "OBJECT",
        description: "Who bought it",
        properties: { name: S("Customer name"), phone: S("Customer phone if given") }
      },
      items: {
        type: "ARRAY",
        description: "Items sold",
        items: {
          type: "OBJECT",
          properties: {
            itemName: S("Item, e.g. gold ring"),
            purity: NUM("Purity like 22K"),
            grossWeight: NUM("Gross weight in grams"),
            netWeight: NUM("Net weight in grams"),
            makingChargeValue: NUM("Making charge percent"),
            huidNumber: S("HUID if given")
          },
          required: ["itemName", "purity", "grossWeight"]
        }
      },
      payment: {
        type: "OBJECT",
        properties: {
          amountPaid: NUM("Amount paid now in rupees"),
          paymentMethod: { type: "STRING", enum: ["cash", "upi", "card", "bank_transfer"], description: "How they paid" }
        }
      }
    },
    required: ["items"]
  },
  slow_stock_report: {
    type: "OBJECT",
    properties: {
      olderThanDays: { type: "INTEGER", description: "Age threshold in days, default 180" }
    }
  },
  promote_slow_stock: {
    type: "OBJECT",
    properties: {
      olderThanDays: { type: "INTEGER", description: "Age threshold in days, default 180" },
      occasion: S("Occasion for the promotion if mentioned, e.g. Diwali"),
      limit: { type: "INTEGER", description: "How many items to promote, default 10" }
    }
  },
  issue_karigar_job: {
    type: "OBJECT",
    properties: {
      karigarName: S("The goldsmith's (karigar) name"),
      itemDescription: S("What is being made, e.g. rope chain"),
      purity: NUM("Purity like 22K"),
      issuedWeight: NUM("Weight of gold issued in grams")
    },
    required: ["karigarName", "itemDescription", "purity", "issuedWeight"]
  },
  record_karigar_return: {
    type: "OBJECT",
    properties: {
      karigarName: S("The goldsmith's (karigar) name, to find their latest open job"),
      finishedWeight: NUM("Finished piece weight in grams"),
      scrapWeight: NUM("Scrap gold returned in grams")
    },
    required: ["karigarName", "finishedWeight"]
  },
  karigar_scorecard: {
    type: "OBJECT",
    properties: { karigarName: S("The goldsmith's (karigar) name") },
    required: ["karigarName"]
  },
  create_inventory_item: {
    type: "OBJECT",
    properties: {
      name: S("Item name, e.g. temple necklace"),
      purity: NUM("Purity like 22K"),
      category: S("Category if mentioned, e.g. necklace"),
      grossWeight: NUM("Gross weight in grams"),
      netWeight: NUM("Net weight in grams"),
      estimatedValue: NUM("Estimated value in rupees"),
      sku: S("SKU if given"),
      location: S("Location if given")
    },
    required: ["name", "purity"]
  },
  record_stock_movement: {
    type: "OBJECT",
    properties: {
      itemName: S("Item name to identify the stock item"),
      sku: S("SKU to identify the stock item"),
      movementType: { type: "STRING", enum: ["adjustment", "stock_in", "stock_out", "return", "reserve", "unreserve"], description: "Kind of movement" },
      weight: NUM("Weight in grams if relevant"),
      notes: S("Any note")
    },
    required: ["movementType"]
  },
  create_content_request: {
    type: "OBJECT",
    properties: {
      itemName: S("Item name to make a post for"),
      sku: S("SKU to make a post for"),
      occasion: S("Occasion if mentioned, e.g. Diwali"),
      prompt: S("What the post should say or show")
    }
  },
  buyback_summary: undefined,
  create_buyback_bundle: {
    type: "OBJECT",
    properties: {
      metal: { type: "STRING", enum: ["gold", "silver"], description: "Metal of the bundle" },
      purity: NUM("Purity like 22K"),
      ratePerGram: NUM("Rate per gram in rupees")
    },
    required: ["purity", "ratePerGram"]
  },
  assign_buyback_items: {
    type: "OBJECT",
    properties: {
      bundleId: S("The target bundle's id"),
      itemIds: { type: "ARRAY", description: "Buyback item ids to assign", items: S("A buyback item id") }
    },
    required: ["bundleId", "itemIds"]
  },
  update_inventory_status: {
    type: "OBJECT",
    properties: {
      itemName: S("Item name to identify the stock item"),
      sku: S("SKU to identify the stock item"),
      status: { type: "STRING", enum: ["available", "reserved", "sold", "in_workshop", "inactive"], description: "New status" },
      notes: S("Any note")
    },
    required: ["status"]
  },
  create_karigar: {
    type: "OBJECT",
    properties: {
      name: S("The karigar's (goldsmith) name"),
      phone: S("Phone number if given"),
      specialization: S("Specialization if mentioned, e.g. chains"),
      notes: S("Any note")
    },
    required: ["name"]
  },
  generate_content_post: {
    type: "OBJECT",
    properties: {
      itemName: S("Item name to feature in the post, if mentioned"),
      sku: S("SKU to feature, if mentioned"),
      occasion: S("Occasion like Diwali or Akshaya Tritiya, if mentioned"),
      text: S("Short description of the post the shopkeeper wants, if given")
    }
  },
  approve_content_post: undefined,
  publish_content_post: {
    type: "OBJECT",
    properties: {
      platforms: { type: "ARRAY", description: "Which platforms to post to: instagram and/or facebook. Omit to use all connected.", items: { type: "STRING", enum: ["instagram", "facebook"] } },
      scheduledAt: S("When to publish, if the shopkeeper wants to schedule it instead of now (a date and time)")
    }
  }
};

/** The confirm/cancel gate: writes wait for the shopkeeper's spoken yes. */
export const CONFIRM_TOOL = "confirm_pending_action";
export const CANCEL_TOOL = "cancel_pending_action";

export function buildFunctionDeclarations(): GeminiFunctionDeclaration[] {
  const actions = voiceActionNames.map((name) => ({
    name,
    description:
      voiceActionMetadata[name].description +
      (voiceActionMetadata[name].requiresConfirmation
        ? " This needs the shopkeeper to confirm before saving; the system will read the numbers back."
        : ""),
    parameters: ACTION_PARAMS[name]
  }));
  return [
    ...actions,
    { name: CONFIRM_TOOL, description: "Call this only after the shopkeeper clearly says yes to a read-back the system asked them to confirm. It saves the pending action." },
    { name: CANCEL_TOOL, description: "Call this if the shopkeeper says no, cancel, or wants to change a pending action before it is saved." }
  ];
}

/** Map an STT language code (en-IN, ta-IN, ...) to a plain language name. */
export function languageName(code?: string): string {
  const map: Record<string, string> = { en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", kn: "Kannada" };
  return map[(code ?? "en").slice(0, 2).toLowerCase()] ?? "English";
}

/**
 * System instruction for a live session. The reply language is pinned to the
 * language the shopkeeper selected, so Gemini stops code-mixing or drifting into
 * another language (it was replying in Tamil/Spanish for English input).
 */
export function geminiSystemInstruction(language = "English"): string {
  return [
    "You are Sornam, a warm, concise voice assistant at an Indian jewellery shop counter.",
    `Reply ONLY in ${language}. Every reply, including confirmations and questions, must be entirely in ${language}.`,
    `Never mix languages, never insert words from another language, and never switch to a different language (especially never Spanish), even if the shopkeeper code-mixes. If they speak another language, still answer in ${language}.`,
    "Keep every reply to one or two short spoken sentences.",
    "Use the tools to do real work. Infer sensible values; do not ask about things you can reasonably assume or that have defaults.",
    "To answer any question about stock, value, counts, karigars, buyback or slow-moving items, you MUST call the matching tool and read back ONLY the numbers it returns.",
    "Never state a count, weight, value, rupee amount, name or date that did not come from a tool result in this turn. If you do not have a figure from a tool, call the tool or say you need to check - never guess or estimate.",
    "Do exactly what the shopkeeper asked and nothing more. Do not start an unrelated task, and never ask for details (like a customer name or phone) for something they did not request.",
    "When a tool needs the shopkeeper to confirm, the system returns a read-back message. Read those exact numbers back to the shopkeeper and ask if you should save it.",
    "Only call confirm_pending_action after they clearly say yes. If they say no or want changes, call cancel_pending_action.",
    "Never invent weights, rates or amounts. If a tool asks for missing detail, ask the shopkeeper for it naturally, never mention field names or technical terms."
  ].join(" ");
}

/** Default English instruction (kept for any caller that does not pass a language). */
export const GEMINI_SYSTEM_INSTRUCTION = geminiSystemInstruction("English");
