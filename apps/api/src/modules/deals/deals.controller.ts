import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import {
  CreateDealDto,
  ListDealsQueryDto,
  StageMoveDto,
  UpdateDealDto,
  createDealSchema,
  listDealsQuerySchema,
  stageMoveSchema,
  updateDealSchema
} from "./deals.schemas";
import { DealsService } from "./deals.service";

@Controller("deals")
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createDealSchema)) body: CreateDealDto, @CurrentUser() user: AuthUser) {
    return this.deals.create(body, user);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listDealsQuerySchema)) query: ListDealsQueryDto, @CurrentUser() user: AuthUser) {
    return this.deals.list(query, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.deals.findOne(id, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateDealSchema)) body: UpdateDealDto, @CurrentUser() user: AuthUser) {
    return this.deals.update(id, body, user);
  }

  @Patch(":id/stage")
  moveStage(@Param("id") id: string, @Body(new ZodValidationPipe(stageMoveSchema)) body: StageMoveDto, @CurrentUser() user: AuthUser) {
    return this.deals.moveStage(id, body, user);
  }
}
