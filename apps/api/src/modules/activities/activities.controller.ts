import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { CreateActivityDto, createActivitySchema } from "./activities.schemas";
import { ActivitiesService } from "./activities.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Post("deals/:dealId/activities")
  createForDeal(
    @Param("dealId") dealId: string,
    @Body(new ZodValidationPipe(createActivitySchema)) body: CreateActivityDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.activities.createForDeal(dealId, body, user);
  }

  @Get("deals/:dealId/activities")
  listForDeal(@Param("dealId") dealId: string, @CurrentUser() user: AuthUser) {
    return this.activities.listForDeal(dealId, user);
  }

  @Get("companies/:companyId/activities")
  listForCompany(@Param("companyId") companyId: string, @CurrentUser() user: AuthUser) {
    return this.activities.listForCompany(companyId, user);
  }
}
