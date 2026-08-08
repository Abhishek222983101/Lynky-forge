import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { env } from "@/common/config/env";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AiAskResult, AiQuoteResult, DraftQuoteInput } from "./ai.types";
import { ASK_CACHED_QUESTIONS, ASK_SYSTEM, DRAFT_QUOTE_SYSTEM } from "./ai.prompts";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const KIMI_URL = "https://api.moonshot.cn/v1/chat/completions";

type Provider = "groq" | "kimi";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  // ── Quote Draft ─────────────────────────────────────────────────────

  async draftQuote(input: DraftQuoteInput, actor: AuthUser): Promise<AiQuoteResult> {
    const shopId = this.requireShop(actor);

    const deal = await this.prisma.deal.findFirst({
      where: { id: input.dealId, shopId },
      include: {
        rfq: true,
        company: { select: { name: true, industry: true } }
      }
    });
    if (!deal) throw new AppError("Deal not found", 404);
    if (!deal.rfq) throw new AppError("Deal has no RFQ to draft from", 400);

    const rfq = deal.rfq;
    const rfqHash = hashPayload({
      partName: rfq.partName,
      partNo: rfq.partNo,
      material: rfq.material,
      qty: rfq.qty,
      tolerance: rfq.tolerance
    });

    // Cache hit → instant
    const cached = await this.prisma.aiQuoteCache.findUnique({ where: { rfqHash } });
    if (cached) {
      this.logger.log(`Quote draft cache HIT for ${rfq.partNo}`);
      return cached.payload as unknown as AiQuoteResult;
    }

    // Live AI call with stub fallback
    let result: AiQuoteResult;
    try {
      const raw = await this.callJson(DRAFT_QUOTE_SYSTEM, this.buildRfqPrompt(
        {
          partName: rfq.partName,
          partNo: rfq.partNo,
          material: rfq.material,
          qty: rfq.qty,
          tolerance: rfq.tolerance,
          targetPrice: rfq.targetPrice?.toString() ?? null,
          deadline: rfq.deadline,
          drawingNotes: rfq.drawingNotes
        },
        deal.company
      ));
      result = this.validateQuoteResult(raw);
      await this.prisma.aiQuoteCache.create({
        data: { rfqHash, payload: result as unknown as Prisma.InputJsonValue }
      });
      await this.audit.create(this.prisma, {
        shopId,
        actorUserId: actor.id,
        action: "ai.quote_draft_generated",
        entityType: "quote",
        entityId: deal.id,
        source: "ai",
        afterData: { partNo: rfq.partNo, provider: this.getProvider(), lineItems: result.lineItems.length }
      });
      this.logger.log(`Quote draft generated via ${this.getProvider()} for ${rfq.partNo}`);
    } catch (err) {
      this.logger.warn(`AI draft failed, using stub: ${(err as Error).message}`);
      result = this.stubDraft(rfq);
    }

    return result;
  }

  // ── Ask ─────────────────────────────────────────────────────────────

  async ask(question: string, actor: AuthUser): Promise<AiAskResult> {
    const shopId = this.requireShop(actor);
    const qHash = hashPayload({ q: question.toLowerCase().trim() });

    // Cache hit
    const cached = await this.prisma.askCache.findUnique({ where: { questionHash: qHash } });
    if (cached) {
      return { answer: cached.answer, cards: [] };
    }

    const context = await this.buildPipelineContext(shopId);

    let answer: string;
    try {
      answer = await this.callText(ASK_SYSTEM, this.buildAskPrompt(question, context));
    } catch (err) {
      this.logger.warn(`AI ask failed, using stub: ${(err as Error).message}`);
      answer = this.stubAskAnswer(question, context);
    }

    // Cache (ignore duplicate-key race)
    await this.prisma.askCache
      .create({ data: { questionHash: qHash, answer } })
      .catch(() => {});

    await this.audit.create(this.prisma, {
      shopId,
      actorUserId: actor.id,
      action: "ai.ask_executed",
      entityType: "ask",
      source: "ai",
      afterData: { question, provider: this.hasProvider() ? this.getProvider() : "stub" }
    });

    return { answer, cards: this.extractCards(answer) };
  }

  async getCachedQuestions(): Promise<string[]> {
    return ASK_CACHED_QUESTIONS;
  }

  // ── AI calls ────────────────────────────────────────────────────────

  private hasProvider(): boolean {
    return Boolean(env.GROQ_API_KEY || env.KIMI_API_KEY);
  }

  private getProvider(): Provider {
    if (env.GROQ_API_KEY) return "groq";
    if (env.KIMI_API_KEY) return "kimi";
    throw new Error("No AI provider configured");
  }

  /** Call AI expecting a JSON object response (for quote drafting). */
  private async callJson(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
    const provider = this.getProvider();
    const apiKey = provider === "groq" ? env.GROQ_API_KEY! : env.KIMI_API_KEY!;
    const model = provider === "groq" ? env.GROQ_MODEL : env.KIMI_MODEL;
    const url = provider === "groq" ? GROQ_URL : KIMI_URL;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: provider === "groq" ? { type: "json_object" } : undefined
      }),
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${provider} API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    return this.parseJson(raw);
  }

  /** Call AI expecting a plain text/markdown response (for Ask). */
  private async callText(systemPrompt: string, userPrompt: string): Promise<string> {
    const provider = this.getProvider();
    const apiKey = provider === "groq" ? env.GROQ_API_KEY! : env.KIMI_API_KEY!;
    const model = provider === "groq" ? env.GROQ_MODEL : env.KIMI_MODEL;
    const url = provider === "groq" ? GROQ_URL : KIMI_URL;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 800
      }),
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${provider} API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private parseJson(raw: string): Record<string, unknown> {
    let clean = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      return JSON.parse(clean) as Record<string, unknown>;
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as Record<string, unknown>;
      throw new Error("Failed to parse AI JSON response");
    }
  }

  private validateQuoteResult(raw: Record<string, unknown>): AiQuoteResult {
    const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems : [];
    const validated = lineItems
      .filter((li): li is Record<string, unknown> => typeof li === "object" && li !== null)
      .map((li) => ({
        description: String(li.description ?? "Item"),
        qty: Number(li.qty) || 1,
        unitPrice: Number(li.unitPrice) || 0
      }))
      .filter((li) => li.qty > 0 && li.unitPrice >= 0);

    if (validated.length === 0) throw new Error("AI returned no valid line items");

    const totalAmount =
      typeof raw.totalAmount === "number" && raw.totalAmount > 0
        ? raw.totalAmount
        : validated.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);

    const leadTimeDays = Number(raw.leadTimeDays) || 14;

    const terms = Array.isArray(raw.terms)
      ? raw.terms.filter((t): t is string => typeof t === "string").slice(0, 10)
      : ["50% advance, balance on delivery", "Warranty: 30 days against manufacturing defects"];

    return { lineItems: validated, totalAmount, leadTimeDays, terms };
  }

  // ── Prompt builders ─────────────────────────────────────────────────

  private buildRfqPrompt(
    rfq: {
      partName: string;
      partNo: string;
      material: string;
      qty: number;
      tolerance: string | null;
      targetPrice: string | number | null;
      deadline: Date;
      drawingNotes: string | null;
    },
    company: { name: string; industry: string }
  ): string {
    return [
      `Customer: ${company.name} (${company.industry})`,
      `Part: ${rfq.partName}`,
      `Part Number: ${rfq.partNo}`,
      `Material: ${rfq.material}`,
      `Quantity: ${rfq.qty} pcs`,
      rfq.tolerance ? `Tolerance: ${rfq.tolerance}` : null,
      rfq.targetPrice ? `Target Price: ₹${rfq.targetPrice}` : null,
      `Delivery Deadline: ${rfq.deadline.toISOString().slice(0, 10)}`,
      rfq.drawingNotes ? `Drawing Notes: ${rfq.drawingNotes}` : null,
      "",
      "Generate a detailed, itemized quote. Break down material, machining, finishing, tooling, packaging."
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildAskPrompt(question: string, context: PipelineContext): string {
    return [
      "=== LIVE CRM DATA ===",
      JSON.stringify(context, null, 2),
      "=== END DATA ===",
      "",
      `Question: ${question}`,
      "",
      "Answer using ONLY the data above. Be specific — cite deal titles, company names, amounts in ₹.",
      "Use bullet points if listing multiple items. Keep it under 4 sentences unless listing items.",
      "All money in Indian format (₹X.XXL for lakhs)."
    ].join("\n");
  }

  // ── Context builder ─────────────────────────────────────────────────

  private async buildPipelineContext(shopId: string): Promise<PipelineContext> {
    const now = new Date();

    const [stageCounts, topDeals, overdueTasks, recentQuotes, wonLost] = await Promise.all([
      this.prisma.deal.groupBy({
        by: ["stage"],
        where: { shopId },
        _count: true,
        _sum: { value: true }
      }),
      this.prisma.deal.findMany({
        where: { shopId, stage: { notIn: ["WON", "LOST"] } },
        orderBy: { value: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          value: true,
          stage: true,
          leadScore: true,
          expectedClose: true,
          createdAt: true,
          company: { select: { name: true } }
        }
      }),
      this.prisma.task.findMany({
        where: { shopId, status: "DUE", dueAt: { lt: now } },
        take: 10,
        orderBy: { dueAt: "asc" },
        include: { deal: { select: { title: true, company: { select: { name: true } } } } }
      }),
      this.prisma.quote.findMany({
        where: { shopId, status: "SENT" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          quoteNo: true,
          totalAmount: true,
          createdAt: true,
          deal: { select: { title: true, company: { select: { name: true } } } }
        }
      }),
      this.prisma.deal.groupBy({
        by: ["stage"],
        where: { shopId, stage: { in: ["WON", "LOST"] } },
        _count: true,
        _sum: { value: true }
      })
    ]);

    const won = wonLost.find((d) => d.stage === "WON");
    const lost = wonLost.find((d) => d.stage === "LOST");

    return {
      pipelineByStage: stageCounts.map((s) => ({
        stage: s.stage,
        dealCount: s._count,
        totalValue: s._sum.value?.toString() ?? "0"
      })),
      topOpenDeals: topDeals.map((d) => ({
        title: d.title,
        company: d.company.name,
        value: d.value.toString(),
        stage: d.stage,
        leadScore: d.leadScore,
        ageDays: Math.floor((now.getTime() - d.createdAt.getTime()) / 86_400_000)
      })),
      overdueTasks: overdueTasks.map((t) => ({
        message: t.message,
        overdueDays: Math.floor((now.getTime() - t.dueAt.getTime()) / 86_400_000),
        deal: t.deal?.title ?? null,
        company: t.deal?.company.name ?? "—"
      })),
      quotesAwaitingResponse: recentQuotes.map((q) => ({
        quoteNo: q.quoteNo,
        amount: q.totalAmount.toString(),
        deal: q.deal.title,
        company: q.deal.company.name,
        sentDaysAgo: Math.floor((now.getTime() - q.createdAt.getTime()) / 86_400_000)
      })),
      winLoss: {
        wonCount: won?._count ?? 0,
        wonValue: won?._sum.value?.toString() ?? "0",
        lostCount: lost?._count ?? 0,
        lostValue: lost?._sum.value?.toString() ?? "0"
      }
    };
  }

  // ── Card extraction (pulls key numbers from answer) ─────────────────

  private extractCards(answer: string): { label: string; value: string }[] {
    const cards: { label: string; value: string }[] = [];
    const lakhMatch = answer.match(/₹\s*[\d.]+\s*L/i);
    if (lakhMatch) cards.push({ label: "Pipeline", value: lakhMatch[0] });
    const countMatch = answer.match(/(\d+)\s*(?:deals?|tasks?|quotes?|RFQs?)/i);
    if (countMatch) cards.push({ label: "Count", value: countMatch[1] });
    return cards.slice(0, 3);
  }

  // ── Stubs (never crash — demo safety net) ───────────────────────────

  private stubDraft(rfq: {
    partName: string;
    material: string;
    qty: number;
    tolerance: string | null;
  }): AiQuoteResult {
    const rates: Record<string, number> = {
      SS304: 280, SS316: 350, MS: 85, "Aluminium 6061": 320, "Al 6061": 320, Brass: 420
    };
    const rate = rates[rfq.material] ?? 150;
    const estWeight = 0.8;
    const tolerancePremium = rfq.tolerance?.includes("0.01") ? 1.2 : 1.0;

    const materialUnit = Math.round((rfq.qty * rate * estWeight / rfq.qty) * tolerancePremium);
    const machiningUnit = Math.round(400 * tolerancePremium);
    const finishingUnit = 80;
    const packagingUnit = 60;

    return {
      lineItems: [
        { description: `${rfq.material} raw material — estimated ${estWeight}kg/pc`, qty: rfq.qty, unitPrice: materialUnit },
        { description: `CNC machining — ${rfq.partName}`, qty: rfq.qty, unitPrice: machiningUnit },
        { description: "Surface finishing & deburring", qty: rfq.qty, unitPrice: finishingUnit },
        { description: "Inspection & QC report", qty: rfq.qty, unitPrice: 40 },
        { description: "Packaging & dispatch", qty: rfq.qty, unitPrice: packagingUnit }
      ],
      totalAmount: Math.round((materialUnit + machiningUnit + finishingUnit + 40 + packagingUnit) * rfq.qty),
      leadTimeDays: 14,
      terms: [
        "50% advance with PO, balance before dispatch",
        "Delivery: 14 working days from order confirmation",
        "Warranty: 30 days against manufacturing defects",
        "Prices valid for 30 days, ex-works Bangalore"
      ]
    };
  }

  private stubAskAnswer(question: string, ctx: PipelineContext): string {
    const q = question.toLowerCase();
    const totalValue = ctx.pipelineByStage.reduce((s, p) => s + Number(p.totalValue), 0);
    const totalDeals = ctx.pipelineByStage.reduce((s, p) => s + p.dealCount, 0);
    const totalLakh = (totalValue / 100000).toFixed(1);

    if (q.includes("pipeline") || q.includes("value") || q.includes("worth")) {
      return `Your open pipeline is **₹${totalLakh}L** across ${totalDeals} active deals. The largest is ${ctx.topOpenDeals[0]?.title ?? "—"} at ₹${(Number(ctx.topOpenDeals[0]?.value ?? 0) / 100000).toFixed(1)}L (${ctx.topOpenDeals[0]?.company}).`;
    }
    if (q.includes("overdue") || q.includes("follow") || q.includes("attention") || q.includes("priority")) {
      if (ctx.overdueTasks.length === 0) return "No overdue tasks. You're all caught up.";
      const top = ctx.overdueTasks.slice(0, 3);
      return `${ctx.overdueTasks.length} overdue task(s):\n${top.map((t) => `• ${t.message} — ${t.company} (${t.overdueDays}d late)`).join("\n")}`;
    }
    if (q.includes("win rate") || q.includes("won") || q.includes("lost")) {
      const total = ctx.winLoss.wonCount + ctx.winLoss.lostCount;
      if (total === 0) return "No closed deals yet to calculate win rate.";
      const rate = Math.round((ctx.winLoss.wonCount / total) * 100);
      return `Win rate: **${rate}%** — ${ctx.winLoss.wonCount} won, ${ctx.winLoss.lostCount} lost.`;
    }
    if (q.includes("quote") && q.includes("wait")) {
      if (ctx.quotesAwaitingResponse.length === 0) return "No quotes awaiting response.";
      return `${ctx.quotesAwaitingResponse.length} quote(s) sent, awaiting response:\n${ctx.quotesAwaitingResponse.map((q) => `• ${q.quoteNo} — ₹${(Number(q.amount) / 100000).toFixed(1)}L to ${q.company} (${q.sentDaysAgo}d ago)`).join("\n")}`;
    }
    return `Pipeline: ${totalDeals} deals worth ₹${totalLakh}L. ${ctx.overdueTasks.length} overdue tasks, ${ctx.quotesAwaitingResponse.length} quotes awaiting response.`;
  }

  private requireShop(actor: AuthUser): string {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return actor.shopId;
  }
}

// ── Types ─────────────────────────────────────────────────────────────

interface PipelineContext {
  pipelineByStage: { stage: string; dealCount: number; totalValue: string }[];
  topOpenDeals: {
    title: string;
    company: string;
    value: string;
    stage: string;
    leadScore: string;
    ageDays: number;
  }[];
  overdueTasks: { message: string | null; overdueDays: number; deal: string | null; company: string }[];
  quotesAwaitingResponse: { quoteNo: string; amount: string; deal: string; company: string; sentDaysAgo: number }[];
  winLoss: { wonCount: number; wonValue: string; lostCount: number; lostValue: string };
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
