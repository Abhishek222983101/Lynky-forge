import { Injectable } from "@nestjs/common";
import { AppError } from "@/common/errors/app-error";
import { AuthUser } from "@/common/types/auth-user";
import { AiService } from "@/modules/ai/ai.service";
import { AskQueryDto } from "./ask.schemas";

@Injectable()
export class AskService {
  constructor(private readonly ai: AiService) {}

  async query(input: AskQueryDto, actor: AuthUser) {
    if (!actor.shopId) throw new AppError("Shop context required", 400);
    return this.ai.ask(input.question, actor);
  }

  async getCachedQuestions() {
    return this.ai.getCachedQuestions();
  }
}
