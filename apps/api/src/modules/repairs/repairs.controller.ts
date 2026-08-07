import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { RepairsService } from "./repairs.service";
import { repairCreateSchema, repairListQuerySchema, repairStatusUpdateSchema, RepairCreateDto, RepairListQuery, RepairStatusUpdateDto } from "./repairs.schemas";

@Controller("repairs")
@UseGuards(JwtAuthGuard)
export class RepairsController {
  constructor(private readonly repairs: RepairsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(repairCreateSchema)) body: RepairCreateDto, @CurrentUser() user: AuthUser) {
    return this.repairs.create(user, body);
  }

  @Get()
  list(@Query(new ZodValidationPipe(repairListQuerySchema)) query: RepairListQuery, @CurrentUser() user: AuthUser) {
    return this.repairs.list(user, query);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.repairs.summary(user);
  }

  @Get(":repairOrderId")
  get(@Param("repairOrderId") repairOrderId: string, @CurrentUser() user: AuthUser) {
    return this.repairs.get(user, repairOrderId);
  }

  @Patch(":repairOrderId/status")
  updateStatus(@Param("repairOrderId") repairOrderId: string, @Body(new ZodValidationPipe(repairStatusUpdateSchema)) body: RepairStatusUpdateDto, @CurrentUser() user: AuthUser) {
    return this.repairs.updateStatus(user, repairOrderId, body);
  }
}
