import { Inject, Injectable } from "@nestjs/common";
import { Prisma, VoiceIntent, VoiceStatus, VoiceToolInvocationStatus } from "@prisma/client";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { SarvamSttClient } from "@/modules/integrations/sarvam/sarvam-stt.client";
import { SarvamTtsClient } from "@/modules/integrations/sarvam/sarvam-tts.client";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { classifyConfirmation } from "./confirmation";
import { RouterDecision, VOICE_ROUTER, VoiceRouter } from "./router/voice-router";
import { CreateVoiceSessionDto } from "./voice.schemas";
import { VoiceActionName, voiceActionList } from "./voice-actions";
import { VoiceCommandBusService } from "./voice-command-bus.service";
import { VoicePolicyService } from "./voice-policy.service";
import { VoicePreviewService } from "./voice-preview.service";
import { VoiceResolverService } from "./voice-resolver.service";

type SttMetadata = {
  detectedLanguage?: string;
  stt?: { provider: string; requestId?: string; languageProbability?: number };
};

/**
 * Orchestrates one voice turn as a fixed pipeline:
 *   STT (audio only) -> router (pick action + natural args)
 *   -> resolver (names -> UUIDs) -> preview (validate + read-back)
 *   -> confirm gate (writes) or immediate execute (reads) -> command bus.
 * The service owns session state and the confirm/clarify loop; each stage is a
 * single-responsibility collaborator, so any action in the catalog flows through
 * the same path without special-casing here.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sarvamStt: SarvamSttClient,
    private readonly sarvamTts: SarvamTtsClient,
    private readonly audit: AuditLogsService,
    private readonly commandBus: VoiceCommandBusService,
    private readonly policy: VoicePolicyService,
    private readonly resolver: VoiceResolverService,
    private readonly preview: VoicePreviewService,
    @Inject(VOICE_ROUTER) private readonly router: VoiceRouter
  ) {}

  async createSession(input: CreateVoiceSessionDto, actor: AuthUser) {
    return this.createSessionFromTranscript(input.transcript, input.source, actor);
  }

  async createSessionFromAudio(file: { buffer: Buffer; originalname?: string; mimetype?: string }, source: CreateVoiceSessionDto["source"], actor: AuthUser, languageCode?: string) {
    if (!file?.buffer?.length) throw new AppError("Audio file is required", 400);
    const transcription = await this.sarvamStt.transcribe({
      audio: file.buffer,
      filename: file.originalname ?? "voice.webm",
      mimeType: file.mimetype ?? "audio/webm",
      languageCode
    });
    return this.createSessionFromTranscript(transcription.transcript, source, actor, {
      detectedLanguage: transcription.languageCode,
      stt: { provider: "sarvam", requestId: transcription.requestId, languageProbability: transcription.languageProbability }
    });
  }

  private async createSessionFromTranscript(transcript: string, source: CreateVoiceSessionDto["source"], actor: AuthUser, metadata?: SttMetadata) {
    if (!actor.shopId) throw new AppError("Voice sessions require a shop user", 400);
    const session = await this.prisma.voiceSession.create({
      data: {
        shopId: actor.shopId,
        userId: actor.id,
        source,
        rawTranscript: transcript,
        normalizedText: transcript.trim().toLowerCase(),
        detectedLanguage: metadata?.detectedLanguage,
        status: VoiceStatus.received,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });
    return this.processTranscript(session, transcript, actor, metadata);
  }

  private async processTranscript(session: { id: string; shopId: string }, transcript: string, actor: AuthUser, metadata?: SttMetadata) {
    const decision = await this.router.route({ transcript });

    if (decision.action === "unknown") {
      return this.awaitClarification(session, decision, decision.clarification ?? this.helpMessage(), metadata);
    }
    // The model drives the dialogue: if it chose to ask something, use its own
    // words (already in the shopkeeper's language). The Zod schema in the preview
    // step remains the safety net for what actually gets written.
    if (decision.clarification) {
      return this.awaitClarification(session, decision, decision.clarification, metadata);
    }

    const resolution = await this.resolver.resolve(decision.action, decision.arguments, session.shopId);
    if (!resolution.ok) {
      return this.awaitClarification(session, decision, resolution.clarification, metadata);
    }

    const preview = await this.preview.build(decision.action, resolution.arguments, actor);
    if (preview.status === "incomplete") {
      // Let the model phrase the follow-up question - never expose field names.
      const question = await this.router.clarify({
        action: decision.action,
        knownArguments: resolution.arguments,
        missingFields: preview.missingFields,
        transcript
      });
      return this.awaitClarification(session, decision, question, metadata);
    }

    if (!this.policy.requiresConfirmation(decision.action)) {
      return this.executeImmediate(session.id, decision.action, preview.input, actor, metadata);
    }
    return this.proposeConfirmation(session, decision.action, preview.input, preview.confirmationMessage, actor, metadata);
  }

  async reply(sessionId: string, reply: string, actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Voice sessions require a shop user", 400);
    const session = await this.prisma.voiceSession.findFirst({ where: { id: sessionId, shopId: actor.shopId } });
    if (!session) throw new AppError("Voice session not found", 404);
    if (session.status === VoiceStatus.awaiting_confirmation) return this.confirm(sessionId, reply, actor);
    if (session.status !== VoiceStatus.awaiting_clarification) throw new AppError("Voice session is not awaiting a reply", 409);
    // Slot filling: append the follow-up answer and re-route the full conversation.
    const transcript = [session.rawTranscript, reply].filter(Boolean).join(" ");
    await this.prisma.voiceSession.update({ where: { id: session.id }, data: { rawTranscript: transcript, normalizedText: transcript.trim().toLowerCase(), status: VoiceStatus.received } });
    return this.processTranscript(session, transcript, actor);
  }

  async confirm(sessionId: string, confirmation: string, actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Voice sessions require a shop user", 400);
    const session = await this.prisma.voiceSession.findFirst({ where: { id: sessionId, shopId: actor.shopId } });
    if (!session) throw new AppError("Voice session not found", 404);
    if (session.status !== VoiceStatus.awaiting_confirmation) throw new AppError("Voice session is not awaiting confirmation", 409);
    const invocation = await this.prisma.voiceToolInvocation.findFirst({
      where: { voiceSessionId: session.id, shopId: actor.shopId, status: VoiceToolInvocationStatus.awaiting_confirmation },
      orderBy: { createdAt: "desc" }
    });
    if (!invocation) throw new AppError("No pending voice action found for confirmation", 409);

    const decision = classifyConfirmation(confirmation);
    if (decision === "no") {
      const updated = await this.prisma.$transaction(async (tx) => {
        const cancelled = await tx.voiceSession.update({ where: { id: session.id }, data: { status: VoiceStatus.cancelled } });
        await tx.voiceToolInvocation.update({ where: { id: invocation.id }, data: { status: VoiceToolInvocationStatus.cancelled } });
        await this.audit.create(tx, { shopId: actor.shopId, actorUserId: actor.id, action: "voice_action.cancelled", entityType: "voice_session", entityId: session.id, source: "voice", afterData: { actionName: invocation.actionName, status: "cancelled" } });
        return cancelled;
      });
      return { status: updated.status, action: invocation.actionName, result: null };
    }
    if (decision !== "yes") {
      // Unclear reply (neither yes nor no): keep the action pending and re-ask,
      // rather than erroring. The shopkeeper just answers again.
      const question = "Sorry, I did not catch that. Should I save this? Please say yes or no.";
      await this.prisma.voiceSession.update({ where: { id: session.id }, data: { confirmationMessage: question } });
      return { sessionId: session.id, status: VoiceStatus.awaiting_confirmation, action: invocation.actionName, confirmationMessage: question };
    }

    await this.prisma.voiceToolInvocation.update({ where: { id: invocation.id }, data: { status: VoiceToolInvocationStatus.confirmed, confirmedAt: new Date() } });
    try {
      const result = await this.commandBus.execute(invocation.actionName as VoiceActionName, invocation.input, actor);
      await this.prisma.$transaction(async (tx) => {
        await tx.voiceToolInvocation.update({ where: { id: invocation.id }, data: { status: VoiceToolInvocationStatus.executed, output: this.json(result), executedAt: new Date() } });
        await tx.voiceSession.update({ where: { id: session.id }, data: { status: invocation.actionName === "record_sale_draft" ? VoiceStatus.confirmed : VoiceStatus.executed } });
        await this.audit.create(tx, { shopId: actor.shopId, actorUserId: actor.id, action: "voice_action.executed", entityType: "voice_tool_invocation", entityId: invocation.id, source: "voice", afterData: { actionName: invocation.actionName } });
      });
      if (invocation.actionName === "record_sale_draft") {
        const sale = result as any;
        return { status: VoiceStatus.confirmed, action: invocation.actionName, sale, invoice: sale.invoice, payment: sale.payments?.[0] ?? null, pendingPayment: sale.pendingPayment ?? null };
      }
      return { status: VoiceStatus.executed, action: invocation.actionName, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice action failed";
      await this.prisma.voiceToolInvocation.update({ where: { id: invocation.id }, data: { status: VoiceToolInvocationStatus.failed, errorMessage: message } });
      await this.prisma.voiceSession.update({ where: { id: session.id }, data: { status: VoiceStatus.failed, confirmationMessage: message } });
      throw error;
    }
  }

  listActions() {
    return { actions: voiceActionList() };
  }

  /** Speak a read-back or answer aloud (Sarvam Indic TTS), key kept server-side. */
  async synthesizeSpeech(text: string, languageCode?: string) {
    return this.sarvamTts.synthesize({ text, languageCode });
  }

  private async proposeConfirmation(session: { id: string; shopId: string }, action: VoiceActionName, input: unknown, confirmationMessage: string, actor: AuthUser, metadata?: SttMetadata) {
    const invocation = await this.createInvocation(session.id, session.shopId, actor.id, action, input, confirmationMessage);
    const updated = await this.prisma.voiceSession.update({
      where: { id: session.id },
      data: {
        intent: this.intentFor(action),
        status: VoiceStatus.awaiting_confirmation,
        extractedPayload: this.json({ action, input, invocationId: invocation.id, stt: metadata?.stt }),
        confirmationMessage
      }
    });
    return this.toResponse(updated);
  }

  private async awaitClarification(session: { id: string }, decision: RouterDecision, message: string, metadata?: SttMetadata) {
    const updated = await this.prisma.voiceSession.update({
      where: { id: session.id },
      data: {
        intent: this.intentFor(decision.action),
        status: VoiceStatus.awaiting_clarification,
        extractedPayload: this.json({ decision, supportedActions: voiceActionList(), stt: metadata?.stt }),
        confirmationMessage: message
      }
    });
    return this.toResponse(updated);
  }

  private async executeImmediate(sessionId: string, action: VoiceActionName, input: unknown, actor: AuthUser, metadata?: SttMetadata) {
    if (!actor.shopId) throw new AppError("Voice sessions require a shop user", 400);
    const invocation = await this.createInvocation(sessionId, actor.shopId, actor.id, action, input);
    try {
      const result = await this.commandBus.execute(action, input, actor);
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.voiceToolInvocation.update({ where: { id: invocation.id }, data: { status: VoiceToolInvocationStatus.executed, output: this.json(result), executedAt: new Date() } });
        return tx.voiceSession.update({
          where: { id: sessionId },
          data: { intent: this.intentFor(action), status: VoiceStatus.executed, extractedPayload: this.json({ action, input, result, stt: metadata?.stt }), confirmationMessage: this.answerText(action, result) }
        });
      });
      return this.toResponse(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice action failed";
      await this.prisma.voiceToolInvocation.update({ where: { id: invocation.id }, data: { status: VoiceToolInvocationStatus.failed, errorMessage: message } });
      throw error;
    }
  }

  private async createInvocation(sessionId: string, shopId: string, actorUserId: string, actionName: VoiceActionName, input: unknown, confirmationMessage?: string) {
    const requiresConfirmation = this.policy.requiresConfirmation(actionName);
    return this.prisma.voiceToolInvocation.create({
      data: {
        shopId,
        voiceSessionId: sessionId,
        actorUserId,
        actionName,
        input: this.json(input),
        status: requiresConfirmation ? VoiceToolInvocationStatus.awaiting_confirmation : VoiceToolInvocationStatus.proposed,
        requiresConfirmation,
        confirmationMessage
      }
    });
  }

  private intentFor(action: RouterDecision["action"]): VoiceIntent {
    if (action === "record_sale_draft") return VoiceIntent.record_sale;
    if (action === "ask_owner_cockpit") return VoiceIntent.ask_owner_question;
    return VoiceIntent.unknown;
  }

  private answerText(action: VoiceActionName, result: any): string {
    if (action === "ask_owner_cockpit") return result?.answer ?? "Answered from Sornam records.";
    if (action === "stock_summary") return `Current stock count is ${result?.totalItems ?? 0} item(s).`;
    if (action === "slow_stock_report") return `You have ${result?.count ?? 0} slow-moving item(s) worth about Rs ${result?.stuckValue ?? 0}.`;
    if (action === "karigar_scorecard") return "Here is the karigar's scorecard.";
    if (action === "buyback_summary") return "Here is the buyback summary.";
    if (action === "generate_invoice_pdf") return "Invoice PDF generated.";
    if (action === "approve_content_post") return "Approved your latest post. Say publish it to post it to Instagram or Facebook.";
    return "Voice action completed.";
  }


  private helpMessage(): string {
    // Human, example-led help (spoken) instead of a dump of internal action names.
    return (
      "I did not catch that. You can say things like: " +
      "sold a 22 carat gold chain, 12 grams, to Lakshmi; " +
      "how much cash did we take today; " +
      "add a new gold ring to stock; " +
      "or issue twenty grams to Kumar. " +
      "Please say one clear thing at a time."
    );
  }

  private toResponse(session: any) {
    return { sessionId: session.id, status: session.status, extractedPayload: session.extractedPayload, confirmationMessage: session.confirmationMessage };
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
