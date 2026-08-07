// Optional orchestrator: asks the Sarvam chat model (the repo's LLM) to compile a
// CompiledPrompt using the governing system prompt, then validates + enforces it.
// Enabled via CONTENT_ORCHESTRATOR_PROVIDER=sarvam. Mirrors LlmVoiceRouter.
//
// The LLM adds richer, request-aware prompt copy, but it is best-effort: sarvam-30b
// is a reasoning model and the governing prompt is large, so a call can truncate.
// On any failure we fall back to the deterministic orchestrator, which produces a
// valid CompiledPrompt from the same rules in code, so generation never fails here.

import { Injectable, Logger } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { DeterministicContentOrchestrator } from "./deterministic-orchestrator";
import { loadSystemPrompt } from "./prompt-loader";
import { compiledPromptSchema, ContentOrchestrator, enforceContract } from "./orchestrator";
import { CompiledPrompt, ContentRequest } from "./types";

@Injectable()
export class LlmContentOrchestrator implements ContentOrchestrator {
  private readonly logger = new Logger(LlmContentOrchestrator.name);
  private readonly fallback = new DeterministicContentOrchestrator();

  async compile(request: ContentRequest): Promise<CompiledPrompt> {
    if (!env.SARVAM_API_KEY) {
      this.logger.warn("Sarvam API key not configured; using the deterministic content orchestrator.");
      return this.fallback.compile(request);
    }
    try {
      return await this.compileWithSarvam(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sarvam content orchestrator unavailable (${message}); falling back to the deterministic prompt.`);
      return this.fallback.compile(request);
    }
  }

  private async compileWithSarvam(request: ContentRequest): Promise<CompiledPrompt> {
    const hasProduct = Boolean(request.productImages && request.productImages.length > 0);
    const userMessage = [
      `Request: ${request.text}`,
      `Product image attached: ${hasProduct ? "yes" : "no"}`,
      request.requestedType ? `Requested type: ${request.requestedType}` : "",
      request.occasion ? `Occasion: ${request.occasion}` : "",
      request.category ? `Category: ${request.category}` : "",
      request.platform ? `Platform: ${request.platform}` : "",
      `Caption language: ${request.language ?? "en"}`,
      "",
      "Return ONLY a JSON object matching this shape:",
      "{positive, negative, aspectRatio(9:16|4:5|1:1|16:9), outputType(image|reel|carousel|both),",
      " attachmentMode(with-product|text-only), houseLook(heritage-opulence|jewel-tone-drama|modern-serenity),",
      " lane(female-95|other-5), captionSuggestions:string[], occasion:string|null, category:string|null}.",
      "Reels MUST be 9:16. Never put text/label/brand words in positive; always put them in negative.",
      "",
      // sarvam-30b reasons in the completion channel, and the governing system
      // prompt is large; without this the reasoning pass can consume the whole
      // token budget and truncate the JSON (finish_reason "length").
      "Answer immediately with only the JSON object. Do not write any reasoning, analysis, or explanation before it.",
    ]
      .filter(Boolean)
      .join("\n");

    const content = await this.completeJson(userMessage);
    const parsed = compiledPromptSchema.safeParse(this.parseJson(content));
    if (!parsed.success) {
      throw new AppError(`Sarvam content orchestrator returned invalid prompt: ${parsed.error.message}`, 422);
    }
    return enforceContract(parsed.data);
  }

  /**
   * One structured completion against Sarvam with a hard timeout. sarvam-30b is a
   * reasoning model over a large prompt and can take ~25s per call, which is far
   * too slow for the studio. We cap each call at 8s and let the caller fall back to
   * the instant deterministic orchestrator on timeout/failure.
   */
  private async completeJson(userMessage: string): Promise<string> {
    const attempts = 1;
    let lastReason = "unknown";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SARVAM_API_KEY}`,
          "api-subscription-key": env.SARVAM_API_KEY as string,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.SARVAM_CHAT_MODEL,
          temperature: 0.4,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: loadSystemPrompt() },
            { role: "user", content: userMessage },
          ],
        }),
      }).finally(() => clearTimeout(timer));

      const body = (await response.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      if (!response.ok) {
        throw new AppError(`Sarvam content orchestrator failed: ${JSON.stringify(body)}`, response.status);
      }
      const content = body.choices?.[0]?.message?.content;
      lastReason = body.choices?.[0]?.finish_reason ?? "unknown";
      if (typeof content === "string" && content.trim() !== "") {
        return content;
      }
    }
    throw new AppError(`Sarvam content orchestrator returned no content after ${attempts} attempts (finish_reason: ${lastReason})`, 502);
  }

  private parseJson(content: string): unknown {
    const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) throw new AppError("Sarvam content orchestrator returned non-JSON content", 422);
      return JSON.parse(match[0]);
    }
  }
}
