// Service entry: orchestrator -> provider(s) -> disclosure -> quality gate.

import { Inject, Injectable, Logger } from "@nestjs/common";
import { buildAiLabel } from "./composition";
import { storeImage } from "./content-storage";
import { DisclosureService } from "./disclosure";
import { ImageProvider, IMAGE_PROVIDER } from "./providers/image-provider";
import { VideoProvider, VIDEO_PROVIDER } from "./providers/video-provider";
import { ContentOrchestrator, CONTENT_ORCHESTRATOR } from "./orchestrator";
import { runQualityCheck } from "./quality-check";
import { AspectRatio, CompiledPrompt, ContentRequest, GeneratedAsset } from "./types";

const CAROUSEL_SIZE = 3;

@Injectable()
export class ContentStudioService {
  private readonly logger = new Logger("ContentStudioService");

  constructor(
    @Inject(CONTENT_ORCHESTRATOR) private readonly orchestrator: ContentOrchestrator,
    @Inject(IMAGE_PROVIDER) private readonly image: ImageProvider,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
    private readonly disclosure: DisclosureService,
  ) {}

  async generate(request: ContentRequest): Promise<GeneratedAsset[]> {
    const compiled = await this.orchestrator.compile(request);
    const reference = request.productImages?.[0];
    const caption = compiled.captionSuggestions[0];
    const aiLabel = buildAiLabel(compiled.houseLook, compiled.occasion, compiled.category);
    const assets: GeneratedAsset[] = [];

    const wantImage = compiled.outputType === "image" || compiled.outputType === "carousel" || compiled.outputType === "both";
    const wantReel = compiled.outputType === "reel" || compiled.outputType === "both";
    const stillAspect: AspectRatio = compiled.outputType === "both" ? "4:5" : compiled.aspectRatio;

    if (wantImage) {
      const count = compiled.outputType === "carousel" ? CAROUSEL_SIZE : 1;
      for (let i = 0; i < count; i++) {
        const still = await this.image.generateStill({ compiled, aspectRatio: stillAspect, referenceImage: reference });
        assets.push(
          await this.finalize(compiled, {
            kind: "image",
            url: still.url,
            buffer: still.buffer,
            aspectRatio: stillAspect,
            caption,
            aiLabel,
            meta: { ...still.meta, houseLook: compiled.houseLook, index: i },
            fidelityConfirmed: compiled.attachmentMode === "with-product",
            disclosureApplied: false,
          }),
        );
      }
    }

    if (wantReel) {
      // Reels are ALWAYS 9:16 and built from a generated hero still.
      const hero = await this.image.generateStill({ compiled, aspectRatio: "9:16", referenceImage: reference });
      const reel = await this.video.generateReel({ compiled, heroStill: hero, aspectRatio: "9:16", maxSeconds: 8 });
      assets.push(
        await this.finalize(compiled, {
          kind: "reel",
          url: reel.url,
          buffer: reel.buffer,
          aspectRatio: "9:16",
          caption,
          aiLabel,
          meta: { ...reel.meta, houseLook: compiled.houseLook },
          fidelityConfirmed: compiled.attachmentMode === "with-product",
          disclosureApplied: false,
        }),
      );
    }

    return assets;
  }

  private async finalize(compiled: CompiledPrompt, asset: GeneratedAsset): Promise<GeneratedAsset> {
    let stamped = await this.disclosure.apply(asset);
    // Turn real image bytes into a persistable URL (data URL by default).
    if (stamped.kind === "image" && stamped.buffer && !stamped.url) {
      const mime = typeof stamped.meta.mimeType === "string" ? stamped.meta.mimeType : "image/png";
      stamped = { ...stamped, url: await storeImage(stamped.buffer, mime) };
    }
    // Drop the raw buffer from the returned asset (url carries it now).
    const { buffer: _buffer, ...clean } = stamped;
    const quality = runQualityCheck(clean, compiled);
    if (!quality.passed) {
      this.logger.warn(`Content quality issues on ${clean.kind}: ${quality.issues.join("; ")}`);
    }
    return { ...clean, meta: { ...clean.meta, quality } };
  }
}
