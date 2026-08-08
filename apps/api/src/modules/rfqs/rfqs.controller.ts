import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { CreateRfqDto, ListRfqsQueryDto, createRfqSchema, listRfqsQuerySchema } from "./rfqs.schemas";
import { RfqsService } from "./rfqs.service";

@Controller("rfqs")
@UseGuards(JwtAuthGuard)
export class RfqsController {
  constructor(private readonly rfqs: RfqsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createRfqSchema)) body: CreateRfqDto, @CurrentUser() user: AuthUser) {
    return this.rfqs.create(body, user);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listRfqsQuerySchema)) query: ListRfqsQueryDto, @CurrentUser() user: AuthUser) {
    return this.rfqs.list(query, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.rfqs.findOne(id, user);
  }
}
