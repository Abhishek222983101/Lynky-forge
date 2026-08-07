import { Injectable } from "@nestjs/common";
import { voiceActionList } from "@/modules/voice/voice-actions";
import { parseSaleTranscript } from "@/modules/voice/voice.parser";
import { ClarificationRequest, RouterContext, RouterDecision, VoiceRouter } from "./voice-router";

const REPAIR_STATUS_WORDS: Record<string, string> = {
  received: "received",
  workshop: "in_workshop",
  "in workshop": "in_workshop",
  ready: "ready",
  delivered: "delivered",
  "picked up": "delivered"
};

/**
 * Rule-based router used offline (no Sarvam key) and in tests. It covers the
 * highest-traffic commands deterministically; anything it cannot confidently
 * classify returns `unknown` with a capability prompt, so the LLM router is the
 * general path in production.
 */
@Injectable()
export class DeterministicVoiceRouter implements VoiceRouter {
  // Offline fallback: no model to phrase questions, so keep it simple and human.
  async clarify(_request: ClarificationRequest): Promise<string> {
    return "Could you say that again with the full details?";
  }

  async route(context: RouterContext): Promise<RouterDecision> {
    const transcript = context.transcript.trim();
    const lower = transcript.toLowerCase();

    if (/\b(sold|sale)\b/.test(lower)) {
      return this.saleDecision(transcript);
    }
    if (/\b(add|new|create|register)\s+customer\b/.test(lower)) {
      return this.createCustomerDecision(transcript, lower);
    }
    if (/\brepair\b/.test(lower) && this.matchRepairStatus(lower)) {
      return this.updateRepairStatusDecision(transcript, lower);
    }
    if (/\brepair\b/.test(lower) || /\border\b/.test(lower)) {
      return this.createRepairDecision(transcript, lower);
    }
    if (/\b(stock|inventory)\b/.test(lower) && !/\b(sold|sale)\b/.test(lower)) {
      return { action: "stock_summary", arguments: {} };
    }
    if (/\b(how much|who owes|owe|pending|udhaar|cash|today|trend|analytics|top customer|scheme|maturing|sales?)\b/.test(lower)) {
      return { action: "ask_owner_cockpit", arguments: { question: transcript } };
    }

    return {
      action: "unknown",
      arguments: {},
      clarification: this.capabilityPrompt()
    };
  }

  private saleDecision(transcript: string): RouterDecision {
    const parsed = parseSaleTranscript(transcript);
    if (parsed.missingFields?.length) {
      return { action: "record_sale_draft", arguments: {}, missingFields: parsed.missingFields };
    }
    return {
      action: "record_sale_draft",
      arguments: {
        customer: parsed.customer ?? undefined,
        items: parsed.items,
        payment: parsed.payment
      }
    };
  }

  private createCustomerDecision(transcript: string, lower: string): RouterDecision {
    const name = this.extractName(transcript);
    const phone = this.extractPhone(lower);
    const missingFields = name ? [] : ["fullName"];
    return {
      action: "create_customer",
      arguments: { fullName: name ?? undefined, phone: phone ?? undefined },
      missingFields: missingFields.length ? missingFields : undefined
    };
  }

  private createRepairDecision(transcript: string, lower: string): RouterDecision {
    const name = this.extractName(transcript);
    const itemDescription = this.extractRepairItem(lower);
    const missingFields = [!name && "customerName", !itemDescription && "itemDescription"].filter(Boolean) as string[];
    return {
      action: "create_repair_order",
      arguments: {
        customerName: name ?? undefined,
        customerPhone: this.extractPhone(lower) ?? undefined,
        itemDescription: itemDescription ?? undefined
      },
      missingFields: missingFields.length ? missingFields : undefined
    };
  }

  private updateRepairStatusDecision(transcript: string, lower: string): RouterDecision {
    const status = this.matchRepairStatus(lower);
    const name = this.extractName(transcript);
    const orderNumber = lower.match(/\b(?:order|repair)\s*(?:number|no\.?|#)?\s*([a-z]{2,5}-?\d{2,})/i)?.[1];
    return {
      action: "update_repair_status",
      arguments: {
        repairOrderNumber: orderNumber ?? undefined,
        customerName: orderNumber ? undefined : name ?? undefined,
        status: status ?? undefined
      },
      missingFields: status ? undefined : ["status"]
    };
  }

  private matchRepairStatus(lower: string): string | null {
    for (const [word, status] of Object.entries(REPAIR_STATUS_WORDS)) {
      if (lower.includes(word)) return status;
    }
    return null;
  }

  private extractName(transcript: string): string | null {
    const match = transcript.match(/\b(?:for|to|named|name is|customer)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    return match?.[1]?.trim() ?? null;
  }

  private extractPhone(lower: string): string | null {
    return lower.match(/\b(\d{10})\b/)?.[1] ?? null;
  }

  private extractRepairItem(lower: string): string | null {
    const match = lower.match(/repair(?:\s+for\s+[a-z ]+?)?(?:[,:]| of| -)?\s+((?:gold|silver|diamond)?\s*[a-z]+(?:\s+[a-z]+)?)/);
    const candidate = match?.[1]?.trim();
    if (!candidate || /^(for|order|is|number)$/.test(candidate)) return null;
    return candidate;
  }

  private capabilityPrompt(): string {
    const actions = voiceActionList()
      .map((action) => action.name.replace(/_/g, " "))
      .join(", ");
    return `I can help with: ${actions}. Please say one clear action.`;
  }
}
