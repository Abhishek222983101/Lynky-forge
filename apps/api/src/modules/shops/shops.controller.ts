import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { createShopSchema, CreateShopDto } from "./shops.schemas";
import { ShopsService } from "./shops.service";

@Controller("shops")
@UseGuards(JwtAuthGuard)
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Post()
  @UseGuards(RolesGuard(UserRole.admin))
  create(@Body(new ZodValidationPipe(createShopSchema)) body: CreateShopDto, @CurrentUser() user: AuthUser) {
    return this.shops.create(body, user);
  }

  /** The shop the signed-in user belongs to, so the app can name it. */
  @Get("current")
  current(@CurrentUser() user: AuthUser) {
    return this.shops.findForUser(user);
  }
}
