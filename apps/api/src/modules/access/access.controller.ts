import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { AccessService } from "./access.service";
import { accessUpsertSchema, AccessUpsertDto } from "./access.schemas";

@Controller("access")
@UseGuards(JwtAuthGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  list(@Query("userId") userId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.access.list(user, userId);
  }

  @Post()
  upsert(@Body(new ZodValidationPipe(accessUpsertSchema)) body: AccessUpsertDto, @CurrentUser() user: AuthUser) {
    return this.access.upsert(user, body);
  }
}
