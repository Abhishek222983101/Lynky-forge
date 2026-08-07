// M4 Content Studio - shared types (exported at every boundary, strict typing).

export type OutputType = "image" | "reel" | "carousel" | "both";
export type HouseLook = "heritage-opulence" | "jewel-tone-drama" | "modern-serenity";
export type ContentLane = "female-95" | "other-5";
export type AspectRatio = "9:16" | "4:5" | "1:1" | "16:9";
export type AttachmentMode = "with-product" | "text-only";
export type CaptionLanguage = "en" | "ta";

export interface ImageRef {
  url?: string;
  base64?: string;
  mimeType?: string;
}

export interface ContentRequest {
  text: string;
  productImages?: ImageRef[];
  requestedType?: OutputType;
  occasion?: string | null;
  category?: string | null;
  platform?: string | null;
  language?: CaptionLanguage;
}

export interface CompiledPrompt {
  positive: string;
  negative: string;
  aspectRatio: AspectRatio;
  outputType: OutputType;
  attachmentMode: AttachmentMode;
  houseLook: HouseLook;
  lane: ContentLane;
  captionSuggestions: string[];
  occasion: string | null;
  category: string | null;
}

export interface GeneratedAsset {
  kind: "image" | "reel";
  url?: string;
  buffer?: Buffer;
  aspectRatio: AspectRatio;
  caption?: string;
  aiLabel?: string;
  meta: Record<string, unknown>;
  fidelityConfirmed: boolean;
  disclosureApplied: boolean;
}

export interface ProviderOutput {
  url?: string;
  buffer?: Buffer;
  meta: Record<string, unknown>;
}
