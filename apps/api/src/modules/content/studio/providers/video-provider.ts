// Video provider: interface + DI token + offline stub (default, no key, no env).
// Reels are ALWAYS 9:16. The real Veo 3 adapter lives in veo3-video.provider.ts.

import { Injectable } from "@nestjs/common";
import { CompiledPrompt, ProviderOutput } from "../types";

export const VIDEO_PROVIDER = Symbol("VIDEO_PROVIDER");

export interface VideoReelInput {
  compiled: CompiledPrompt;
  heroStill: ProviderOutput;
  /** Always "9:16" - passed explicitly and asserted by the provider. */
  aspectRatio: "9:16";
  maxSeconds?: number;
}

export interface VideoProvider {
  generateReel(input: VideoReelInput): Promise<ProviderOutput>;
  /** Poll a long-running reel operation; returns the finished output or null if still processing. */
  pollReel?(operation: string): Promise<ProviderOutput | null>;
}

const STUB_BASE_URL = "https://assets.sornam.local/content";

/** Deterministic offline stub - returns a placeholder 9:16 reel. No API key. */
@Injectable()
export class StubVideoProvider implements VideoProvider {
  async generateReel(input: VideoReelInput): Promise<ProviderOutput> {
    const seconds = Math.min(input.maxSeconds ?? 8, 8);
    const seed = `${input.compiled.houseLook}-${input.compiled.category ?? "jewellery"}`;
    return {
      url: `${STUB_BASE_URL}/stub/reel/${encodeURIComponent(seed)}-9x16-${seconds}s.mp4`,
      meta: {
        provider: "stub",
        aspectRatio: "9:16",
        seconds,
        derivedFromHeroStill: Boolean(input.heroStill.url || input.heroStill.buffer),
      },
    };
  }
}
