// Section 17 - AI provenance. Visible on-image watermarking is disabled: these
// creatives are published by the shop as their own marketing, so no label is
// burned onto the pixels. We still record `aiGenerated` in metadata so the
// asset record stays honest about how it was produced.

import { Injectable } from "@nestjs/common";
import { GeneratedAsset } from "./types";

@Injectable()
export class DisclosureService {
  async apply(asset: GeneratedAsset): Promise<GeneratedAsset> {
    const meta = { ...asset.meta, aiGenerated: true, disclosureMode: "metadata-only" as const };
    return { ...asset, disclosureApplied: true, meta };
  }
}
