import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { SchemesService } from "./schemes.service";
import { schemeCreateSchema, schemeInstallmentSchema, schemeListQuerySchema, schemeStatusSchema, SchemeCreateDto, SchemeInstallmentDto, SchemeListQuery, SchemeStatusDto } from "./schemes.schemas";

@Controller("schemes")
@UseGuards(JwtAuthGuard)
export class SchemesController {
  constructor(private readonly schemes: SchemesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(schemeCreateSchema)) body: SchemeCreateDto, @CurrentUser() user: AuthUser) {
    return this.schemes.create(user, body);
  }

  @Get()
  list(@Query(new ZodValidationPipe(schemeListQuerySchema)) query: SchemeListQuery, @CurrentUser() user: AuthUser) {
    return this.schemes.list(user, query);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.schemes.summary(user);
  }

  @Post("follow-ups/generate")
  generateDueFollowUps(@CurrentUser() user: AuthUser) {
    return this.schemes.generateDueFollowUps(user);
  }

  @Get(":schemeId")
  get(@Param("schemeId") schemeId: string, @CurrentUser() user: AuthUser) {
    return this.schemes.get(user, schemeId);
  }

  @Post(":schemeId/installments")
  recordInstallment(@Param("schemeId") schemeId: string, @Body(new ZodValidationPipe(schemeInstallmentSchema)) body: SchemeInstallmentDto, @CurrentUser() user: AuthUser) {
    return this.schemes.recordInstallment(user, schemeId, body);
  }

  @Patch(":schemeId/status")
  updateStatus(@Param("schemeId") schemeId: string, @Body(new ZodValidationPipe(schemeStatusSchema)) body: SchemeStatusDto, @CurrentUser() user: AuthUser) {
    return this.schemes.updateStatus(user, schemeId, body);
  }
}
