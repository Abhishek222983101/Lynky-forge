// Section 0 - Request interpretation and input routing (deterministic keyword logic).

import { AspectRatio, AttachmentMode, OutputType } from "./types";

const REEL_WORDS = ["reel", "video", "clip", "short", "story video", "motion", "animate", "moving"];
const IMAGE_WORDS = ["image", "photo", "post", "picture", "static", "poster", "creative", "banner", "catalogue", "catalog"];
const CAROUSEL_WORDS = ["carousel", "multiple images", "slides", "3 posts", " set "];

/** Section 0.1 - detect output type; ambiguous defaults to a single static image. */
export function detectOutputType(text: string, requested?: OutputType): OutputType {
  if (requested) return requested;
  const t = ` ${text.toLowerCase()} `;
  const hasReel = REEL_WORDS.some((w) => t.includes(w));
  const hasImage = IMAGE_WORDS.some((w) => t.includes(w));
  if ((hasReel && hasImage) || /image and reel|post and video|reel and image|video and post/.test(t)) {
    return "both";
  }
  if (hasReel) return "reel";
  if (CAROUSEL_WORDS.some((w) => t.includes(w))) return "carousel";
  if (hasImage) return "image";
  return "image"; // ambiguous -> single 4:5 image
}

/** Section 0.2 - with-product when a photo is attached, else text-only. */
export function detectAttachmentMode(hasProduct: boolean): AttachmentMode {
  return hasProduct ? "with-product" : "text-only";
}

/** Section 0.4 - aspect-ratio defaults. Reels are ALWAYS 9:16. */
export function aspectForOutput(outputType: OutputType, platform?: string | null): AspectRatio {
  if (outputType === "reel") return "9:16";
  if (platform && /whatsapp/i.test(platform)) return "1:1";
  if (outputType === "carousel") return "4:5";
  return "4:5";
}
