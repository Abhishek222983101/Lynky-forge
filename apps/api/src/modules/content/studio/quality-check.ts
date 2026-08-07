// Section 19 - lightweight, machine-checkable quality gate run after generation.

import { negativeHasMandatoryBlock } from "./negatives";
import { CompiledPrompt, GeneratedAsset } from "./types";

export interface QualityResult {
  passed: boolean;
  issues: string[];
}

const POSITIVE_FORBIDDEN = /\b(text|label|watermark|logo|brand name|typography|subtitle)\b/i;

export function runQualityCheck(asset: GeneratedAsset, compiled: CompiledPrompt): QualityResult {
  const issues: string[] = [];

  if (asset.kind === "reel" && asset.aspectRatio !== "9:16") {
    issues.push("reel aspect ratio is not 9:16");
  }
  if (compiled.attachmentMode === "with-product" && !asset.fidelityConfirmed) {
    issues.push("with-product asset did not confirm fidelity");
  }
  if (!asset.disclosureApplied) {
    issues.push("AI-disclosure overlay not applied");
  }
  if (POSITIVE_FORBIDDEN.test(compiled.positive)) {
    issues.push("positive prompt contains forbidden text/label/brand terms");
  }
  if (!negativeHasMandatoryBlock(compiled.negative)) {
    issues.push("negative prompt missing mandatory text/label/brand terms");
  }
  if (!asset.url && !asset.buffer) {
    issues.push("asset has neither a url nor a buffer");
  }

  return { passed: issues.length === 0, issues };
}
