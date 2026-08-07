import WebSocket from "ws";
import { HttpException } from "@nestjs/common";
import { AuthUser } from "@/common/types/auth-user";
import { env } from "@/common/config/env";
import { VoiceActionName } from "@/modules/voice/voice-actions";
import { VoiceCommandBusService } from "@/modules/voice/voice-command-bus.service";
import { VoicePolicyService } from "@/modules/voice/voice-policy.service";
import { VoicePreviewService } from "@/modules/voice/voice-preview.service";
import { VoiceResolverService } from "@/modules/voice/voice-resolver.service";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { PrismaService } from "@/common/database/prisma.service";
import { buildFunctionDeclarations, CANCEL_TOOL, CONFIRM_TOOL, geminiSystemInstruction } from "./gemini-tools";

const GEMINI_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export type Pipeline = {
  resolver: VoiceResolverService;
  preview: VoicePreviewService;
  policy: VoicePolicyService;
  commandBus: VoiceCommandBusService;
  audit: AuditLogsService;
  prisma: PrismaService;
};

type ToBrowser = (msg: unknown) => void;

/**
 * One live voice session: bridges a browser to Gemini Live and runs every tool
 * call through the shop's real pipeline. Writes are two-phase - a write tool
 * only stages a preview; nothing is saved until Gemini calls confirm after the
 * shopkeeper says yes.
 */
export class GeminiLiveSession {
  private gemini?: WebSocket;
  private pending: { action: VoiceActionName; input: unknown } | null = null;
  // A write blocked on "which one?" — the browser resolves it by tapping a card.
  private pendingChoice: { action: VoiceActionName; args: Record<string, unknown>; ref: "customer" } | null = null;
  private closed = false;
  // Turn latency: from the last inbound mic chunk to Gemini's first spoken byte.
  private lastAudioInAt = 0;
  private awaitingFirstAudio = false;

  constructor(
    private readonly actor: AuthUser,
    private readonly shopId: string,
    private readonly pipe: Pipeline,
    private readonly toBrowser: ToBrowser,
    private readonly language: string = "English"
  ) {}

  start() {
    if (!env.GEMINI_API_KEY) {
      this.toBrowser({ type: "error", message: "Gemini is not configured on the server." });
      return;
    }
    this.gemini = new WebSocket(`${GEMINI_WS}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`);
    this.gemini.on("open", () => this.sendSetup());
    // onGemini is async; a rejection here would otherwise become an unhandled
    // rejection and crash the whole API process (dropping every live session).
    this.gemini.on("message", (data) => {
      void this.onGemini(data).catch((error) => {
        console.error("[gemini-live] message handler error:", error instanceof Error ? error.message : error);
        this.toBrowser({ type: "error", message: "Voice action failed. Please try again." });
      });
    });
    this.gemini.on("close", (code, reason) => {
      const why = reason?.toString() || "";
      if (code !== 1000 && why) console.error(`[gemini-live] closed ${code}: ${why.slice(0, 300)}`);
      this.toBrowser({ type: "closed" });
    });
    this.gemini.on("error", () => this.toBrowser({ type: "error", message: "Voice service connection failed." }));
  }

  /** Browser audio chunk (base64 PCM16 @16k) forwarded straight to Gemini. */
  sendAudio(base64: string) {
    if (this.gemini?.readyState === WebSocket.OPEN) {
      this.lastAudioInAt = Date.now();
      this.awaitingFirstAudio = true;
      // Field is `audio` (a single Blob), not the older `mediaChunks` array -
      // the current API silently ignores mediaChunks, so every frame was dropped.
      this.gemini.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: base64 } } }));
    }
  }

  /** Typed input into the same live session (fallback UI, and how we test tools). */
  sendText(text: string) {
    if (this.gemini?.readyState === WebSocket.OPEN) {
      this.lastAudioInAt = Date.now();
      this.awaitingFirstAudio = true;
      this.gemini.send(
        JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } })
      );
    }
  }

  close() {
    this.closed = true;
    this.gemini?.close();
  }

  private sendSetup() {
    this.gemini?.send(
      JSON.stringify({
        setup: {
          model: env.GEMINI_LIVE_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
            // Counter work needs speed over deliberation; "minimal" is the
            // documented lowest-latency setting.
            thinkingConfig: { thinkingLevel: "minimal" }
          },
          // Turn detection is pure dead time on every spoken turn. 600ms sits in
          // the documented 500-800ms band: long enough to survive a mid-sentence
          // pause while reading out weights, short enough to feel responsive.
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              silenceDurationMs: 600,
              prefixPaddingMs: 20,
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
              endOfSpeechSensitivity: "END_SENSITIVITY_HIGH"
            }
          },
          systemInstruction: { parts: [{ text: geminiSystemInstruction(this.language) }] },
          tools: [{ functionDeclarations: buildFunctionDeclarations() }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      })
    );
    // "ready" is emitted on setupComplete, not here - otherwise a rejected
    // config would still look healthy to the browser.
  }

  private async onGemini(data: WebSocket.RawData) {
    if (this.closed) return;
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.setupComplete) {
      console.log(`[gemini-live] setup accepted (${env.GEMINI_LIVE_MODEL})`);
      this.toBrowser({ type: "ready" });
      return;
    }
    if (msg.error) {
      console.error("[gemini-live] setup/stream error:", JSON.stringify(msg.error).slice(0, 300));
      this.toBrowser({ type: "error", message: "Voice service rejected the request." });
      return;
    }

    // Relay audio + transcripts straight through to the browser.
    const sc = msg.serverContent;
    if (sc) {
      const parts = sc.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
          if (this.awaitingFirstAudio) {
            this.awaitingFirstAudio = false;
            const ms = Date.now() - this.lastAudioInAt;
            console.log(`[gemini-live] turn latency: ${ms}ms (mic-stop -> first spoken audio)`);
          }
          this.toBrowser({ type: "audio", data: part.inlineData.data });
        }
      }
      // Barge-in: the shopkeeper talked over the reply. Tell the browser to drop
      // whatever audio is still queued, otherwise it keeps speaking over them.
      if (sc.interrupted) this.toBrowser({ type: "interrupted" });
      if (sc.inputTranscription?.text) this.toBrowser({ type: "transcript", role: "user", text: sc.inputTranscription.text });
      if (sc.outputTranscription?.text) this.toBrowser({ type: "transcript", role: "assistant", text: sc.outputTranscription.text });
      if (sc.turnComplete) this.toBrowser({ type: "turnComplete" });
    }

    if (msg.toolCall?.functionCalls) {
      for (const call of msg.toolCall.functionCalls) {
        const startedAt = Date.now();
        const response = await this.handleTool(call.name, call.args ?? {});
        console.log(`[gemini-live] tool ${call.name}: ${Date.now() - startedAt}ms`);
        this.gemini?.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response }] } }));
      }
    }
  }

  /** The browser tapped a chooser card. Inject the id and continue the flow. */
  async resolveChoice(id: string) {
    if (!this.pendingChoice) return;
    const { action, args, ref } = this.pendingChoice;
    this.pendingChoice = null;
    const next = { ...args, [`${ref}Id`]: id };
    const response = await this.runAction(action, next);
    // Keep the spoken conversation in sync with the tap.
    this.sendText(`I picked that ${ref}. Continue.`);
    if (this.gemini?.readyState === WebSocket.OPEN) {
      this.gemini.send(JSON.stringify({ toolResponse: { functionResponses: [{ name: action, response }] } }));
    }
  }

  private async handleTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      if (name === CONFIRM_TOOL) return await this.executePending();
      if (name === CANCEL_TOOL) {
        this.pending = null;
        this.pendingChoice = null;
        return { cancelled: true, message: "Cancelled. Nothing was saved." };
      }
      return this.runAction(name as VoiceActionName, args);
    } catch (error) {
      return { error: this.spokenError(error) };
    }
  }

  /** resolve -> preview -> (confirm gate) -> execute, emitting a UI card at each meaningful step. */
  private async runAction(action: VoiceActionName, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resolution = await this.pipe.resolver.resolve(action, args, this.shopId);
    if (!resolution.ok) {
      // Ambiguous reference: show a chooser and remember what to resume.
      if (resolution.choose) {
        this.pendingChoice = { action, args, ref: resolution.choose.ref };
        this.toBrowser({ type: "ui", card: { kind: "choose", ref: resolution.choose.ref, title: "Which one?", options: resolution.choose.options } });
      }
      return { need_detail: resolution.clarification };
    }

    const preview = await this.pipe.preview.build(action, resolution.arguments, this.actor);
    if (preview.status === "incomplete") {
      return { need_detail: `Still need: ${preview.missingFields.join(", ")}. Ask the shopkeeper for it naturally.` };
    }

    // Read-only lookups render their results as a card immediately.
    if (action === "lookup") {
      const result = (await this.pipe.commandBus.execute(action, preview.input, this.actor)) as any;
      this.toBrowser({ type: "ui", card: this.lookupCard(result) });
      return { entity: result.entity, count: result.count, rows: result.rows };
    }

    if (this.pipe.policy.requiresConfirmation(action)) {
      this.pending = { action, input: preview.input };
      this.toBrowser({ type: "ui", card: { kind: "confirm", action, title: "Confirm", message: preview.confirmationMessage, rows: this.scalarRows(preview.input) } });
      return { status: "needs_confirmation", read_back: preview.confirmationMessage };
    }

    const result = await this.pipe.commandBus.execute(action, preview.input, this.actor);
    this.toBrowser({ type: "ui", card: { kind: "saved", title: this.actionTitle(action), rows: this.scalarRows(this.summarize(result)) } });
    return { status: "done", result: this.summarize(result) };
  }

  /**
   * Turn any thrown error into a shopkeeper-friendly line. Our own AppErrors carry
   * a clean {detail} message; anything else (a raw database/validation error) is
   * never spoken verbatim - the owner hears a plain retry prompt, not jargon.
   */
  private spokenError(error: unknown): string {
    if (error instanceof HttpException) {
      const body = error.getResponse() as unknown;
      if (typeof body === "string") return body;
      const detail = (body as { detail?: unknown; message?: unknown })?.detail ?? (body as { message?: unknown })?.message;
      if (typeof detail === "string") return detail;
    }
    return "Sorry, I could not complete that. Please try again.";
  }

  private async executePending(): Promise<Record<string, unknown>> {
    if (!this.pending) return { error: "There is nothing waiting to be saved." };
    const { action, input } = this.pending;
    this.pending = null;
    try {
      const result = await this.pipe.commandBus.execute(action, input, this.actor);
      this.toBrowser({ type: "ui", card: { kind: "saved", title: this.actionTitle(action), rows: this.scalarRows(this.summarize(result)) } });
      return { status: "saved", result: this.summarize(result) };
    } catch (error) {
      // A save can fail on a business rule (e.g. returned weight exceeds issued).
      // Report it to the shopkeeper and Gemini instead of crashing the session.
      const message = this.spokenError(error);
      this.toBrowser({ type: "error", message });
      return { error: message };
    }
  }

  private lookupCard(result: { entity: string; count: number; rows: unknown[] }) {
    return { kind: result.count === 1 ? "detail" : "list", entity: result.entity, title: this.entityTitle(result.entity, result.count), rows: result.rows };
  }

  private entityTitle(entity: string, count: number): string {
    const plural: Record<string, string> = { customer: "customers", inventory: "stock items", sale: "sales", repair: "repairs", scheme: "schemes" };
    if (count === 0) return `No ${plural[entity] ?? entity} found`;
    if (count === 1) return (plural[entity] ?? entity).replace(/s$/, "");
    return `${count} ${plural[entity] ?? entity}`;
  }

  private actionTitle(action: VoiceActionName): string {
    const t: Partial<Record<VoiceActionName, string>> = {
      record_sale_draft: "Sale saved", create_customer: "Customer added", create_repair_order: "Repair created",
      update_repair_status: "Repair updated", create_scheme: "Scheme created", record_scheme_installment: "Installment recorded",
      create_buyback_item: "Buyback recorded", export_accounting_file: "Export ready"
    };
    return t[action] ?? "Done";
  }

  /** Pull top-level readable fields for a card, humanising the keys. */
  private scalarRows(obj: unknown): Array<{ label: string; value: string }> {
    const record = (obj ?? {}) as Record<string, unknown>;
    return Object.entries(record)
      .filter(([, v]) => v !== null && v !== undefined && v !== "" && (typeof v === "string" || typeof v === "number"))
      .slice(0, 6)
      .map(([k, v]) => ({ label: k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()), value: String(v) }));
  }

  /**
   * Compact, spoken-friendly summary of a tool result - never a raw record, but
   * it MUST carry the real figures. Keeps every scalar figure, collapses arrays to
   * a count, and flattens one level of nested totals, so Gemini reads back the
   * true values instead of inventing them.
   */
  private summarize(result: unknown): unknown {
    if (result === null || typeof result !== "object") return { ok: true };
    const record = result as Record<string, unknown>;

    // Writes: surface the identifiers a shopkeeper cares about.
    const invoice = (record.invoice ?? {}) as Record<string, unknown>;
    if (invoice.invoiceNumber) return { invoiceNumber: invoice.invoiceNumber, total: this.scalar(invoice.totalAmount) };
    if (record.jobNumber) return { jobNumber: record.jobNumber, issuedWeight: this.scalar(record.issuedWeight) };

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || /^id$|Id$/.test(key)) continue;
      if (Array.isArray(value)) {
        out[`${key}Count`] = value.length;
        continue;
      }
      const scalar = this.scalar(value);
      if (scalar !== null) {
        out[key] = scalar;
        continue;
      }
      if (typeof value === "object") {
        for (const [nestedKey, nestedVal] of Object.entries(value as Record<string, unknown>)) {
          if (/^id$|Id$/.test(nestedKey)) continue;
          const nestedScalar = this.scalar(nestedVal);
          if (nestedScalar !== null) out[`${key}_${nestedKey}`] = nestedScalar;
        }
      }
    }
    return Object.keys(out).length ? out : { ok: true };
  }

  /** Coerce to a spoken-friendly scalar, turning Decimals/Dates into strings.
   * Returns null for arrays or nested objects so the caller can flatten them. */
  private scalar(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") return value as string | number | boolean;
    if (value instanceof Date) return value.toISOString();
    // decimal.js instances (money, weights) are objects; coerce to their string value.
    if (type === "object" && typeof (value as { toFixed?: unknown }).toFixed === "function") return String(value);
    return null;
  }
}
