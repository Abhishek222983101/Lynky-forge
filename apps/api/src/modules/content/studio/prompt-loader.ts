// Loads the governing system prompt from disk (never hardcoded in .ts) so prompt
// edits stay reviewable in git. Only used by the LLM orchestrator.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

function candidatePaths(): string[] {
  return [
    join(__dirname, "..", "prompts", "system-prompt.md"),
    join(process.cwd(), "src/modules/content/prompts/system-prompt.md"),
    join(process.cwd(), "apps/api/src/modules/content/prompts/system-prompt.md"),
  ];
}

export function loadSystemPrompt(): string {
  if (cached) return cached;
  for (const path of candidatePaths()) {
    if (existsSync(path)) {
      cached = readFileSync(path, "utf8");
      return cached;
    }
  }
  throw new Error("Content Studio system prompt not found (expected content/prompts/system-prompt.md)");
}
