import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { askQuerySchema, AskQueryDto } from "./ask.schemas";
import { AskService } from "./ask.service";

@Controller("ask")
@UseGuards(JwtAuthGuard)
export class AskController {
  constructor(private readonly ask: AskService) {}

  @Get("suggestions")
  suggestions() {
    return this.ask.getCachedQuestions();
  }

  @Post("query")
  query(@Body(new ZodValidationPipe(askQuerySchema)) body: AskQueryDto, @CurrentUser() user: AuthUser) {
    return this.ask.query(body, user);
  }
}
