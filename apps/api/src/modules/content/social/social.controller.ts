import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AuthUser } from "@/common/types/auth-user";
import { ZodValidationPipe } from "@/common/utils/zod-validation.pipe";
import { socialPublishSchema, SocialPublishDto } from "../content.schemas";
import { SocialService } from "./social.service";

@Controller("content/social")
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.social.status(user);
  }

  /** Meta path: return the OAuth URL the owner is redirected to. */
  @Get("meta/connect")
  metaConnect(@CurrentUser() user: AuthUser) {
    return this.social.metaAuthUrl(user);
  }

  @Post("disconnect")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.social.disconnect(user);
  }

  @Post("publish/:assetId")
  publish(
    @Param("assetId") assetId: string,
    @Body(new ZodValidationPipe(socialPublishSchema)) body: SocialPublishDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.social.publishAsset(user, assetId, body.profileIds, body.scheduledAt);
  }
}
