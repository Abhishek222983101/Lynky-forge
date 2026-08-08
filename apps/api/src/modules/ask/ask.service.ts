import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/common/database/prisma.service";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { AskQueryDto } from "./ask.schemas";

@Injectable()
export class AskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService
  ) {}

  async query(input: AskQueryDto, actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    // Stub — Phase 5 replaces with Kimi AI client
    await this.audit.create(this.prisma, {
      shopId: actor.shopId,
      actorUserId: actor.id,
      action: "ask.query_executed",
      entityType: "ask",
      source: "ask",
      afterData: { question: input.question }
    });
    return {
      answer: "Ask-your-CRM is not yet configured. This feature will be available after the AI module is set up.",
      cards: []
    };
  }
}
