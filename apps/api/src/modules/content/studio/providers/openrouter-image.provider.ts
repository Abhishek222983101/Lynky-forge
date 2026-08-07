// OpenRouter image adapter (Nano Banana / Gemini 2.5 Flash Image via OpenRouter).
// Gated on OPENROUTER_API_KEY; uses the repo's env/config system. No secrets in code.
//
// Scope guard (intentional, temporary): the paid model is used ONLY for the single
// "Post only" path (outputType === "image"). Reel hero stills and carousel frames
// keep the free offline stub, so we do not spend credits on paths still in stub.

import { Injectable, Logger } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";
import { ProviderOutput } from "../types";
import { ImageProvider, ImageStillInput, StubImageProvider } from "./image-provider";

@Injectable()
export class OpenRouterImageProvider implements ImageProvider {
  private readonly stub = new StubImageProvider();
  private readonly logger = new Logger("OpenRouterImageProvider");

  async generateStill(input: ImageStillInput): Promise<ProviderOutput> {
    // Only the single post uses the paid model for now; everything else stays stub.
    if (input.compiled.outputType !== "image") {
      return this.stub.generateStill(input);
    }
    if (!env.OPENROUTER_API_KEY) {
      throw new AppError("OpenRouter API key is not configured", 503);
    }
    try {
      return await this.callOpenRouter(input);
    } catch (error) {
      // Never fail generation on a transient network/API error: fall back to the
      // offline stub so the post still generates (with a placeholder image).
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OpenRouter image unavailable (${message}); using the offline stub image.`);
      const stub = await this.stub.generateStill(input);
      return { ...stub, meta: { ...stub.meta, openrouterFallback: true, openrouterError: message } };
    }
  }

  private async callOpenRouter(input: ImageStillInput): Promise<ProviderOutput> {
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `${input.compiled.positive}\nAspect ratio: ${input.aspectRatio}.\nAvoid: ${input.compiled.negative}`,
      },
    ];
    // With-product mode: pass the real product photo as the reference to preserve.
    if (input.compiled.attachmentMode === "with-product" && input.referenceImage?.base64) {
      const mime = input.referenceImage.mimeType ?? "image/jpeg";
      content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${input.referenceImage.base64}` } });
    } else if (input.referenceImage?.url) {
      content.push({ type: "image_url", image_url: { url: input.referenceImage.url } });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sornam.local",
        "X-Title": "Sornam AI Content Studio",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_IMAGE_MODEL,
        modalities: ["image", "text"],
        messages: [{ role: "user", content }],
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
      error?: unknown;
    };
    if (!response.ok) {
      throw new AppError(`OpenRouter image generation failed: ${JSON.stringify(body)}`, response.status);
    }

    const dataUrl = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) {
      throw new AppError(`OpenRouter returned no image data: ${JSON.stringify(body)}`, 502);
    }

    const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(dataUrl);
    if (match) {
      const cropped = await this.stripWatermark(Buffer.from(match[2], "base64"));
      return {
        buffer: cropped,
        meta: {
          provider: "openrouter",
          model: env.OPENROUTER_IMAGE_MODEL,
          mimeType: "image/png",
          aspectRatio: input.aspectRatio,
          usedReference: Boolean(input.referenceImage),
          watermarkTrimmed: true,
        },
      };
    }
    // Non-data URL (hosted): pass it through as-is.
    return {
      url: dataUrl,
      meta: {
        provider: "openrouter",
        model: env.OPENROUTER_IMAGE_MODEL,
        aspectRatio: input.aspectRatio,
        usedReference: Boolean(input.referenceImage),
      },
    };
  }

  /**
   * Gemini/Nano Banana bakes a small "AI sparkle" watermark into a corner of the
   * image. Crop a uniform inset from every edge to remove it while preserving the
   * aspect ratio (subject stays centred). Never fails generation over the crop.
   */
  private async stripWatermark(buffer: Buffer): Promise<Buffer> {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (!w || !h) return buffer;
      const inset = 0.07; // ~7% off each edge; adjust if a sparkle ever survives
      const left = Math.round(w * inset);
      const top = Math.round(h * inset);
      const cw = w - left * 2;
      const ch = h - top * 2;
      if (cw <= 0 || ch <= 0) return buffer;
      return await sharp(buffer).extract({ left, top, width: cw, height: ch }).png().toBuffer();
    } catch {
      return buffer;
    }
  }
}
