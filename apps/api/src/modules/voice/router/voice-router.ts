import { VoiceActionName } from "@/modules/voice/voice-actions";

/**
 * The router's single job: read a transcript and decide which one voice action
 * (tool) it maps to, plus the natural-language arguments it can extract. It does
 * NOT resolve entities to UUIDs, validate against the execution schema, or
 * execute anything — those are later stages of the pipeline.
 */
export type RouterDecision = {
  action: VoiceActionName | "unknown";
  /** Natural arguments (may hold names/phrases, not yet UUIDs). */
  arguments: Record<string, unknown>;
  /** Required slots the router could not fill from the transcript. */
  missingFields?: string[];
  /** A question to ask the user when the utterance is unclear or unsupported. */
  clarification?: string;
};

export type RouterContext = {
  /** Full accumulated transcript, including any follow-up replies. */
  transcript: string;
};

/**
 * Asks the model to compose the next question when an action is missing required
 * detail. The model owns the wording, the language, and what to ask for — the
 * pipeline only tells it which action and which slots are still empty.
 */
export type ClarificationRequest = {
  action: VoiceActionName;
  knownArguments: Record<string, unknown>;
  missingFields: string[];
  transcript: string;
};

export interface VoiceRouter {
  route(context: RouterContext): Promise<RouterDecision>;
  /** Compose a natural, human question for the missing detail (never field names). */
  clarify(request: ClarificationRequest): Promise<string>;
}

/** DI token so the module can swap deterministic vs. LLM implementations. */
export const VOICE_ROUTER = Symbol("VOICE_ROUTER");
