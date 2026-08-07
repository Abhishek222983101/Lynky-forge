import { VoiceIntent } from "@prisma/client";

export type ParsedSalePayload = {
  intent: "record_sale" | "unknown";
  missingFields?: string[];
  customer?: { name: string | null; phone: string | null };
  items?: Array<{
    itemName: string;
    purity: string;
    grossWeight: string;
    netWeight: string;
    makingChargeType: "percentage";
    makingChargeValue: string;
    huidNumber: string | null;
  }>;
  payment?: { amountPaid: string; paymentMethod: "cash" | "upi" | "card" | "bank_transfer" | "other" };
};

export function parseSaleTranscript(transcript: string): ParsedSalePayload {
  const text = transcript.trim();
  const lower = normalizeSpeechText(text.toLowerCase());
  if (!/\b(sold|sale)\b/.test(lower)) return { intent: VoiceIntent.unknown };
  const purity = lower.match(/(\d{2})\s*(carat|karat|ct|k)\b/)?.[1];
  const weight = lower.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(grams?|gms?|gm|g)\b/)?.[1]?.replace(/,/g, "");
  const making = lower.match(/making\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(percent|percentage|%)?/)?.[1]?.replace(/,/g, "") ?? "0";
  const itemName = lower.match(/(?:sold|sale)\s+(?:\d{2}\s*(?:carat|karat|ct|k)\s+)?([a-zA-Z]+)/)?.[1] ?? "item";
  const customer = text.match(/\bto\s+([A-Za-z][A-Za-z ]*?)(?:\.|,| received| paid|$)/i)?.[1]?.trim() ?? null;
  const received = lower.match(/(?:received|paid)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(cash|upi|card|bank transfer|bank_transfer)?/);
  const missingFields = [!purity && "purity", !weight && "weight"].filter(Boolean) as string[];
  if (missingFields.length) return { intent: "record_sale", missingFields };
  return {
    intent: "record_sale",
    customer: { name: customer, phone: null },
    items: [{
      itemName,
      purity: `${purity}K`,
      grossWeight: weight!,
      netWeight: weight!,
      makingChargeType: "percentage",
      makingChargeValue: making,
      huidNumber: null
    }],
    payment: {
      amountPaid: received?.[1]?.replace(/,/g, "") ?? "0",
      paymentMethod: (received?.[2] ?? "cash").replace(" ", "_") as "cash"
    }
  };
}

function normalizeSpeechText(text: string) {
  const replacements: Array<[RegExp, string]> = [
    [/\btwenty\s+four\b/g, "24"],
    [/\btwenty\s+two\b/g, "22"],
    [/\beighteen\s+point\s+five\b/g, "18.5"],
    [/\btwelve\b/g, "12"],
    [/\bfifty\s+thousand\b/g, "50000"],
    [/\bfifty\s+thousands\b/g, "50000"],
    [/\bfive\s+zero\s+zero\s+zero\s+zero\b/g, "50000"],
    [/\bpercent\b/g, "percent"],
    [/\bpercentage\b/g, "percent"],
    [/\brupees\b/g, ""],
    [/\brupee\b/g, ""]
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}
