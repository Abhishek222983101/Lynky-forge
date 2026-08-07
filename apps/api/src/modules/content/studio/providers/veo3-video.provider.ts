// Real Veo 3 adapter. Gated on VEO_API_KEY; uses the repo's env/config system.
// Enforces 9:16, up to 8s, generated from a hero still.

import { Injectable } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { ProviderOutput } from "../types";
import { VideoProvider, VideoReelInput } from "./video-provider";

@Injectable()
export class Veo3VideoProvider implements VideoProvider {
  async generateReel(input: VideoReelInput): Promise<ProviderOutput> {
    if (input.aspectRatio !== "9:16") {
      throw new AppError("Reels must be 9:16", 400);
    }
    if (!env.VEO_API_KEY) {
      throw new AppError("Veo API key is not configured", 503);
    }
    const seconds = Math.min(input.maxSeconds ?? 8, 8);
    const image = input.heroStill.buffer
      ? { bytesBase64Encoded: input.heroStill.buffer.toString("base64") }
      : input.heroStill.url
        ? { gcsUri: input.heroStill.url }
        : undefined;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.VEO_MODEL}:generateContent?key=${env.VEO_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: input.compiled.positive, image }],
        parameters: { aspectRatio: "9:16", durationSeconds: seconds, negativePrompt: input.compiled.negative },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      name?: string;
      response?: { generatedVideos?: Array<{ video?: { uri?: string } }> };
    };
    if (!response.ok) {
      throw new AppError(`Veo reel generation failed: ${JSON.stringify(body)}`, response.status);
    }
    const videoUri = body.response?.generatedVideos?.[0]?.video?.uri;
    return {
      url: videoUri,
      meta: {
        provider: "veo3",
        model: env.VEO_MODEL,
        aspectRatio: "9:16",
        seconds,
        operation: body.name ?? null,
        status: videoUri ? "ready" : "processing",
      },
    };
  }

  async pollReel(operation: string): Promise<ProviderOutput | null> {
    if (!env.VEO_API_KEY) {
      throw new AppError("Veo API key is not configured", 503);
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/${operation}?key=${env.VEO_API_KEY}`;
    const response = await fetch(url);
    const body = (await response.json().catch(() => ({}))) as {
      done?: boolean;
      response?: { generatedVideos?: Array<{ video?: { uri?: string } }> };
    };
    if (!response.ok) {
      throw new AppError(`Veo poll failed: ${JSON.stringify(body)}`, response.status);
    }
    if (!body.done) return null;
    const uri = body.response?.generatedVideos?.[0]?.video?.uri;
    return uri ? { url: uri, meta: { provider: "veo3", status: "ready" } } : null;
  }
}
