import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { voiceActionList, voiceActionNames } from "@/modules/voice/voice-actions";
import { ClarificationRequest, RouterContext, RouterDecision, VoiceRouter } from "./voice-router";

const routerOutputSchema = z.object({
  action: z.enum([...voiceActionNames, "unknown"] as [string, ...string[]]),
  arguments: z.record(z.unknown()).default({}),
  missingFields: z.array(z.string()).optional(),
  clarification: z.string().nullish()
});

/**
 * Production router: gives Sarvam's chat model the full curated tool catalog and
 * asks it to select exactly one action and fill natural arguments. This is
 * "tool calling via structured output" - Sarvam's `json_schema` response format
 * guarantees a well-typed selection without native function-calling. The catalog
 * stays under ~30 tools, so a single call keeps selection accuracy high.
 */
@Injectable()
export class LlmVoiceRouter implements VoiceRouter {
  async route(context: RouterContext): Promise<RouterDecision> {
    if (!env.SARVAM_API_KEY) {
      throw new AppError("Sarvam API key is not configured", 503);
    }

    const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SARVAM_API_KEY}`,
        "api-subscription-key": env.SARVAM_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.SARVAM_CHAT_MODEL,
        temperature: 0,
        // sarvam-30b is a reasoning model: it spends completion tokens on hidden
        // reasoning before emitting the JSON, so a tight budget truncates the
        // answer (finish_reason "length", empty content). Some commands reason for
        // ~3.5k tokens, so we request 4096 - the starter-tier ceiling for this model.
        max_tokens: 4096,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "sornam_voice_action",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                action: { type: "string", enum: [...voiceActionNames, "unknown"] },
                arguments: { type: "object", additionalProperties: true },
                missingFields: { type: "array", items: { type: "string" } },
                clarification: { type: ["string", "null"] }
              },
              required: ["action", "arguments"]
            }
          }
        },
        messages: [
          { role: "system", content: this.systemPrompt() },
          { role: "user", content: `Transcript: ${context.transcript}` }
        ]
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AppError(`Sarvam router failed: ${JSON.stringify(body)}`, response.status);
    }

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AppError("Sarvam router returned no content", 502);
    }

    const parsed = routerOutputSchema.safeParse(this.parseJson(content));
    if (!parsed.success) {
      throw new AppError(`Sarvam router returned invalid selection: ${parsed.error.message}`, 422);
    }

    // sarvam-30b sometimes fills `clarification` with a statement even for a clear,
    // complete command ("Here is the summary...", "No clarification needed..."),
    // which makes the pipeline stall on a non-question. Only honour a clarification
    // when the model genuinely cannot proceed: it picked no action, or it flagged a
    // field as missing. For a resolved action, the resolver and preview stages remain
    // the real safety nets that ask for anything truly missing.
    const needsClarification = parsed.data.action === "unknown" || Boolean(parsed.data.missingFields?.length);
    return {
      action: parsed.data.action as RouterDecision["action"],
      arguments: parsed.data.arguments,
      missingFields: parsed.data.missingFields?.length ? parsed.data.missingFields : undefined,
      clarification: needsClarification ? (parsed.data.clarification ?? undefined) : undefined
    };
  }

  private systemPrompt(): string {
    const catalog = voiceActionList()
      .map((action) => `- ${action.name}: ${action.description} Arguments: ${action.argumentGuide}`)
      .join("\n");
    return [
      "You are the dialogue brain of a jewellery-shop voice assistant used by shopkeepers.",
      "Languages include Tamil, Telugu, Kannada, Hindi and English, often code-mixed.",
      "Return JSON only: {action, arguments, missingFields, clarification}.",
      "Pick the single best action for the command.",
      // Owner business questions and the stock report overlap; the shopkeeper must
      // get a domain-correct answer, so bias money questions to the cockpit.
      "Routing rule: any question about sales, revenue, cash, who has or has not paid, pending dues, top customers, or scheme maturity is 'ask_owner_cockpit'. Use 'stock_summary' ONLY when the owner explicitly asks for the stock or inventory count or value. A karigar's or goldsmith's scorecard, performance, wastage or open jobs is always 'karigar_scorecard', never the cockpit.",
      "Fill arguments using the names described for that action. Infer sensible values where you reasonably can; do not ask about things that have obvious defaults or that you can infer.",
      "Normalize purity like 22K, and money and weights as numeric strings with international digits.",
      "Never invent numbers you were not told (weights, rates, amounts).",
      "If you genuinely cannot proceed without a specific detail, write `clarification` as ONE short, friendly question in the SAME language the shopkeeper used. Ask only for what you truly need. Never mention field names, JSON, or technical terms - talk like a helpful shop assistant.",
      "If no action fits at all, use action \"unknown\" and set clarification to a brief helpful reply.",
      "",
      "Catalog:",
      catalog
    ].join("\n");
  }

  async clarify(request: ClarificationRequest): Promise<string> {
    if (!env.SARVAM_API_KEY) {
      return "Could you say that again with a little more detail?";
    }
    const action = voiceActionList().find((a) => a.name === request.action);
    const system = [
      "You are a warm, concise jewellery-shop voice assistant talking to a shopkeeper.",
      "Reply with ONE short question, in the SAME language as their message.",
      "Never mention field names, JSON, databases or any technical term. Talk like a person at the counter.",
      "Ask only for the missing detail needed to finish the task."
    ].join("\n");
    const user = [
      `Task: ${action?.description ?? request.action}`,
      `What the shopkeeper said: "${request.transcript}"`,
      `Details already understood: ${JSON.stringify(request.knownArguments)}`,
      `Still needed to finish: ${request.missingFields.join(", ")}`,
      "Ask for the missing detail in one friendly sentence."
    ].join("\n");
    try {
      const text = await this.complete([
        { role: "system", content: system },
        { role: "user", content: user }
      ]);
      return text.trim() || "Could you tell me a little more?";
    } catch {
      return "Could you tell me a little more so I can finish that?";
    }
  }

  /** Plain-text chat completion (no schema), used for composing clarifications. */
  private async complete(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SARVAM_API_KEY}`,
        "api-subscription-key": env.SARVAM_API_KEY as string,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: env.SARVAM_CHAT_MODEL, temperature: 0.3, max_tokens: 4096, messages })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new AppError(`Sarvam clarify failed: ${JSON.stringify(body)}`, response.status);
    const content = body?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
  }

  private parseJson(content: string): unknown {
    const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) throw new AppError("Sarvam router returned non-JSON content", 422);
      return JSON.parse(match[0]);
    }
  }
}
