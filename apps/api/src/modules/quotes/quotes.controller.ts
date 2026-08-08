import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import {
  CreateQuoteDto,
  ListQuotesQueryDto,
  UpdateQuoteStatusDto,
  createQuoteSchema,
  listQuotesQuerySchema,
  updateQuoteStatusSchema
} from "./quotes.schemas";
import { QuotesService } from "./quotes.service";

@Controller("quotes")
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createQuoteSchema)) body: CreateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotes.create(body, user);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listQuotesQuerySchema)) query: ListQuotesQueryDto, @CurrentUser() user: AuthUser) {
    return this.quotes.list(query, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.quotes.findOne(id, user);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuoteStatusSchema)) body: UpdateQuoteStatusDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.quotes.updateStatus(id, body, user);
  }
}
