import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { ownerCockpitQuerySchema, OwnerCockpitQueryDto } from "./owner-cockpit.schemas";
import { OwnerCockpitService } from "./owner-cockpit.service";

@Controller("owner-cockpit")
@UseGuards(JwtAuthGuard)
export class OwnerCockpitController {
  constructor(private readonly cockpit: OwnerCockpitService) {}

  @Post("query")
  query(@Body(new ZodValidationPipe(ownerCockpitQuerySchema)) body: OwnerCockpitQueryDto, @CurrentUser() user: AuthUser) {
    return this.cockpit.query(body, user);
  }
}
