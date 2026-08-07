// Real Gemini image adapter (Nano Banana / Gemini 2.5 Flash Image). Gated on
// GEMINI_API_KEY; uses the repo's env/config system. No secrets in code.

import { Injectable } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { ProviderOutput } from "../types";
import { ImageProvider, ImageStillInput } from "./image-provider";

@Injectable()
export class GeminiImageProvider implements ImageProvider {
  async generateStill(input: ImageStillInput): Promise<ProviderOutput> {
    if (!env.GEMINI_API_KEY) {
      throw new AppError("Gemini API key is not configured", 503);
    }
    const parts: Array<Record<string, unknown>> = [
      { text: `${input.compiled.positive}\nAspect ratio: ${input.aspectRatio}.\nNegative: ${input.compiled.negative}` },
    ];
    // With-product mode: pass the product photo as the reference to preserve exactly.
    if (input.compiled.attachmentMode === "with-product" && input.referenceImage?.base64) {
      parts.push({
        inlineData: { mimeType: input.referenceImage.mimeType ?? "image/jpeg", data: input.referenceImage.base64 },
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    if (!response.ok) {
      throw new AppError(`Gemini image generation failed: ${JSON.stringify(body)}`, response.status);
    }
    const inline = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!inline?.data) {
      throw new AppError("Gemini returned no image data", 502);
    }
    return {
      buffer: Buffer.from(inline.data, "base64"),
      meta: { provider: "gemini", model: env.GEMINI_IMAGE_MODEL, mimeType: inline.mimeType ?? "image/png", aspectRatio: input.aspectRatio },
    };
  }
}
