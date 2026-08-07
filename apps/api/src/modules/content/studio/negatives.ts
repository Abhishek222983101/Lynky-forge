// Section 18 - negative prompt rules. The text/label/brand block is mandatory.

import { OutputType } from "./types";

export const BASE_NEGATIVE = [
  'text, words, letters, captions, numbers, label, "AI", "AI-generated", watermark, logo, brand name, signage, typography, subtitle',
  "ai-generated look, ai render, cgi, 3d render, illustration, cartoon, anime, digital painting, render, plastic look, video-game look",
  "plastic skin, wax skin, doll face, over-smoothed skin, airbrushed skin, beauty-filter skin, glossy skin, waxy highlights, over-retouched, over-processed, hdr look, overexposed, too perfect, unrealistic symmetry, mirror-symmetric face, uncanny face",
  "extra fingers, sixth finger, missing fingers, fused fingers, merged fingers, malformed hands, deformed hands, distorted hands, duplicate hand, double hand, extra hand, extra arm, third arm, extra limbs, floating hand, detached hand, crossed arms, overlapping hands, interlocked fingers, hands touching hands, distorted anatomy, elongated body",
  "blurry face, deformed face, mismatched eyes, dead eyes, glassy eyes, crossed eyes, fake teeth, fused teeth",
  "oversaturated colors, neon colors, unrealistic glow, halo glow, bloom, fake bokeh, blown highlights, harsh flash",
  "altered jewellery, redesigned jewellery, recolored metal, wrong metal color, added stones, removed stones",
  "duplicated jewellery, melted jewellery, floating jewellery, misplaced jewellery, warped jewellery",
  "inconsistent shadows, missing shadows, impossible reflections, wrong perspective, distorted background",
  "fantasy background, surreal background, sci-fi background, cluttered background, messy scene",
  "low resolution, low detail, jpeg artifacts, noise, oversharpened, unrealistic pose, stiff pose",
].join(", ");

export const REEL_NEGATIVE_ADDITIONS =
  "warping, morphing, flicker, identity drift, jitter, strobing, fast cuts, whip pan, motion blur artifacts, melting motion";

export function buildNegative(outputType: OutputType): string {
  return outputType === "reel" || outputType === "both"
    ? `${BASE_NEGATIVE}, ${REEL_NEGATIVE_ADDITIONS}`
    : BASE_NEGATIVE;
}

/** Terms that must NEVER appear in a positive prompt (Sections 17 and 18). */
export const FORBIDDEN_POSITIVE_TERMS = [
  "watermark",
  "logo",
  "brand name",
  "typography",
  "subtitle",
  "ai-generated",
  '"ai"',
];

/** True if the negative prompt carries the mandatory text/label/brand terms. */
export function negativeHasMandatoryBlock(negative: string): boolean {
  const n = negative.toLowerCase();
  return n.includes("text") && n.includes("label") && n.includes("brand name");
}
