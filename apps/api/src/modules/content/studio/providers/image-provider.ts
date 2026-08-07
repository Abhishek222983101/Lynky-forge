// Image provider: interface + DI token + offline stub (default, no key, no env).
// The real Gemini adapter lives in gemini-image.provider.ts (it uses env keys).

import { Injectable } from "@nestjs/common";
import { AspectRatio, CompiledPrompt, ImageRef, ProviderOutput } from "../types";

export const IMAGE_PROVIDER = Symbol("IMAGE_PROVIDER");

export interface ImageStillInput {
  compiled: CompiledPrompt;
  aspectRatio: AspectRatio;
  referenceImage?: ImageRef;
}

export interface ImageProvider {
  generateStill(input: ImageStillInput): Promise<ProviderOutput>;
}

const STUB_BASE_URL = "https://assets.sornam.local/content";

/** Deterministic offline stub - returns a placeholder still. No API key needed. */
@Injectable()
export class StubImageProvider implements ImageProvider {
  async generateStill(input: ImageStillInput): Promise<ProviderOutput> {
    const ratio = input.aspectRatio.replace(":", "x");
    const seed = `${input.compiled.houseLook}-${input.compiled.category ?? "jewellery"}`;
    return {
      url: `${STUB_BASE_URL}/stub/still/${encodeURIComponent(seed)}-${ratio}.png`,
      meta: {
        provider: "stub",
        aspectRatio: input.aspectRatio,
        attachmentMode: input.compiled.attachmentMode,
        houseLook: input.compiled.houseLook,
        usedReference: Boolean(input.referenceImage),
      },
    };
  }
}
