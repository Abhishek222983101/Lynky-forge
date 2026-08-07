import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { KarigarService } from "./karigar.service";
import { karigarCreateSchema, karigarJobCreateSchema, karigarReturnCreateSchema, KarigarCreateDto, KarigarJobCreateDto, KarigarReturnCreateDto } from "./karigar.schemas";

@Controller("karigars")
@UseGuards(JwtAuthGuard)
export class KarigarController {
  constructor(private readonly karigars: KarigarService) {}

  @Post()
  create(@Body(new ZodValidationPipe(karigarCreateSchema)) body: KarigarCreateDto, @CurrentUser() user: AuthUser) {
    return this.karigars.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.karigars.list(user);
  }

  @Get("jobs")
  listJobs(@CurrentUser() user: AuthUser) {
    return this.karigars.listJobs(user);
  }

  @Post("jobs")
  issueJob(@Body(new ZodValidationPipe(karigarJobCreateSchema)) body: KarigarJobCreateDto, @CurrentUser() user: AuthUser) {
    return this.karigars.issueJob(user, body);
  }

  @Post("jobs/:jobId/returns")
  recordReturn(@Param("jobId") jobId: string, @Body(new ZodValidationPipe(karigarReturnCreateSchema)) body: KarigarReturnCreateDto, @CurrentUser() user: AuthUser) {
    return this.karigars.recordReturn(user, jobId, body);
  }

  @Get(":karigarId/scorecard")
  scorecard(@Param("karigarId") karigarId: string, @CurrentUser() user: AuthUser) {
    return this.karigars.scorecard(user, karigarId);
  }
}
