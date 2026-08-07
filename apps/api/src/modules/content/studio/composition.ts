// Section 21 - positive prompt composition order, plus caption suggestions (Section 16).

import { AttachmentMode, CaptionLanguage, ContentLane, HouseLook, OutputType } from "./types";

const LOOK_SCENE: Record<HouseLook, string> = {
  "heritage-opulence":
    "Indian palace and temple styling with sandstone jali, carved pillars, maroon velvet, brass vessels, marigold and warm golden ambient light",
  "jewel-tone-drama":
    "deep jewel-tone velvet ground in teal, emerald, burgundy or navy with a single dramatic spotlight and gentle sparkle bokeh",
  "modern-serenity":
    "airy natural daylight in a minimal contemporary setting with soft pastels and clean negative space",
};

export interface CompositionInput {
  outputType: OutputType;
  attachmentMode: AttachmentMode;
  houseLook: HouseLook;
  lane: ContentLane;
  category: string | null;
  occasion: string | null;
}

/**
 * Composes the positive prompt in the Section 21 recommended order:
 * shot/subject + exact piece + model + wardrobe + scene/look + lighting +
 * lens + mood/grade + composition/clean-corner. Never includes text/brand words.
 */
export function composePositive(input: CompositionInput): string {
  const piece = input.category ? `${input.category} jewellery piece` : "jewellery piece";
  const motion = input.outputType === "reel" ? "cinematic vertical film frame" : "editorial photograph";

  const subject =
    input.lane === "female-95"
      ? `Luxury ${motion} of an elegant Indian woman aged 22 to 40 wearing the ${piece} as the clear hero`
      : `Luxury product-hero ${input.outputType === "reel" ? "cinematic macro film frame" : "macro photograph"} of the ${piece}`;

  const fidelity =
    input.attachmentMode === "with-product"
      ? "the exact uploaded jewellery piece preserved unchanged in design, metal tone, stones, motifs and proportions; build only the model, scene and light around it"
      : `an original representative ${piece} faithfully matching the description, representing the category and not any specific real design`;

  const model =
    input.lane === "female-95"
      ? "natural relaxed expression, real photographed skin with visible pores and texture, correct anatomy, hands minimized or out of frame"
      : "no human model; craftsmanship, metal speculars and stones held in critical focus";

  const wardrobe =
    input.lane === "female-95"
      ? "occasion-appropriate silk saree or lehenga in tones that complement the metal, kept slightly de-focused"
      : "a clean supporting surface of silk, velvet or marble";

  const scene = `${LOOK_SCENE[input.houseLook]}${input.occasion ? `, styled for ${input.occasion}` : ""}`;
  const lighting =
    "one confident soft key with gentle fill, physically correct shadows and accurate metal speculars, gold stays warm and true";
  const lens =
    input.lane === "female-95"
      ? "shot on an 85mm f/1.8 prime, jewellery in critical focus, natural depth of field"
      : "shot on a 100mm macro lens, razor-shallow depth of field";
  const grade =
    "rich but natural luxury colour grade, accurate white balance, deep clean blacks, gentle highlight roll-off, no oversaturation";
  const composition =
    "art-directed composition following rule of thirds with a calm uncluttered corner reserved for the app overlay";

  return [subject, fidelity, model, wardrobe, scene, lighting, lens, grade, composition].join("; ") + ".";
}

const LOOK_LABEL: Record<HouseLook, string> = {
  "heritage-opulence": "Heritage Opulence",
  "jewel-tone-drama": "Jewel-Tone Drama",
  "modern-serenity": "Modern Serenity",
};

/** A short AI-generated label for the gallery (house look + occasion/category). */
export function buildAiLabel(houseLook: HouseLook, occasion: string | null, category: string | null): string {
  const context = occasion ?? category ?? "signature";
  const titled = context.charAt(0).toUpperCase() + context.slice(1);
  return `${LOOK_LABEL[houseLook]} - ${titled}`;
}

/** Section 16 - short caption suggestions (English deterministic; Tamil via the LLM path). */
export function buildCaptionSuggestions(
  language: CaptionLanguage,
  occasion: string | null,
  category: string | null,
): string[] {
  const occ = occasion ?? "everyday elegance";
  const item = category ?? "gold jewellery";
  const primary = `Timeless ${item} for ${occ}. Crafted to be treasured. Visit us today. #jewellery #gold`;
  const secondary = `Where tradition meets shine - ${item} styled for ${occ}. Enquire in store. #handcrafted #luxury`;
  const suggestions = [primary, secondary];
  if (language === "ta") {
    suggestions.push("(Tamil caption available when the Sarvam orchestrator is enabled.)");
  }
  return suggestions;
}
