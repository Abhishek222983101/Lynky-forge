// Orchestrator contract: interface, DI token, output schema, and the hard-rule
// enforcement/repair (reels always 9:16; no text/label/brand in the positive).

import { z } from "zod";
import { BASE_NEGATIVE, FORBIDDEN_POSITIVE_TERMS, negativeHasMandatoryBlock } from "./negatives";
import { CompiledPrompt, ContentRequest } from "./types";

/** DI token so the module can swap deterministic vs. LLM orchestrators. */
export const CONTENT_ORCHESTRATOR = Symbol("CONTENT_ORCHESTRATOR");

export interface ContentOrchestrator {
  compile(request: ContentRequest): Promise<CompiledPrompt>;
}

export const compiledPromptSchema = z.object({
  positive: z.string().min(1),
  negative: z.string().min(1),
  aspectRatio: z.enum(["9:16", "4:5", "1:1", "16:9"]),
  outputType: z.enum(["image", "reel", "carousel", "both"]),
  attachmentMode: z.enum(["with-product", "text-only"]),
  houseLook: z.enum(["heritage-opulence", "jewel-tone-drama", "modern-serenity"]),
  lane: z.enum(["female-95", "other-5"]),
  captionSuggestions: z.array(z.string()),
  occasion: z.string().nullable(),
  category: z.string().nullable(),
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Enforces the non-negotiable contract on any CompiledPrompt (from code or LLM):
 * - reels are ALWAYS 9:16 (repair)
 * - the positive prompt never contains text/label/brand words (repair by removal)
 * - the negative prompt always carries the mandatory text/label/brand block (repair)
 */
export function enforceContract(input: CompiledPrompt): CompiledPrompt {
  const aspectRatio = input.outputType === "reel" && input.aspectRatio !== "9:16" ? "9:16" : input.aspectRatio;

  let positive = input.positive;
  for (const term of FORBIDDEN_POSITIVE_TERMS) {
    positive = positive.replace(new RegExp(escapeRegExp(term), "gi"), "");
  }
  positive = positive.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();

  const negative = negativeHasMandatoryBlock(input.negative) ? input.negative : `${BASE_NEGATIVE}, ${input.negative}`;

  return { ...input, aspectRatio, positive, negative };
}
