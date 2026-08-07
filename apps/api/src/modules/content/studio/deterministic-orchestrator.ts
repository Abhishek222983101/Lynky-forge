// Default orchestrator: implements Section 0 routing entirely in code (no LLM,
// no API key). Produces a validated CompiledPrompt.

import { Injectable } from "@nestjs/common";
import { buildCaptionSuggestions, composePositive } from "./composition";
import { pickHouseLook, pickLane } from "./house-look";
import { buildNegative } from "./negatives";
import { ContentOrchestrator, enforceContract } from "./orchestrator";
import { aspectForOutput, detectAttachmentMode, detectOutputType } from "./routing";
import { CompiledPrompt, ContentRequest } from "./types";

@Injectable()
export class DeterministicContentOrchestrator implements ContentOrchestrator {
  async compile(request: ContentRequest): Promise<CompiledPrompt> {
    const hasProduct = Boolean(request.productImages && request.productImages.length > 0);
    const outputType = detectOutputType(request.text, request.requestedType);
    const attachmentMode = detectAttachmentMode(hasProduct);
    const houseLook = pickHouseLook(request.text, request.category);
    const lane = pickLane(request.text, request.category);
    // For "both", the primary CompiledPrompt describes the still (4:5); the
    // service forces 9:16 for the reel asset it derives.
    const primaryType = outputType === "both" ? "image" : outputType;
    const aspectRatio = aspectForOutput(primaryType, request.platform);

    const compiled: CompiledPrompt = {
      positive: composePositive({
        outputType,
        attachmentMode,
        houseLook,
        lane,
        category: request.category ?? null,
        occasion: request.occasion ?? null,
      }),
      negative: buildNegative(outputType),
      aspectRatio,
      outputType,
      attachmentMode,
      houseLook,
      lane,
      captionSuggestions: buildCaptionSuggestions(request.language ?? "en", request.occasion ?? null, request.category ?? null),
      occasion: request.occasion ?? null,
      category: request.category ?? null,
    };

    return enforceContract(compiled);
  }
}
