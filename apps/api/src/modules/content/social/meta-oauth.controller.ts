import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { SocialService } from "./social.service";

// Public (unguarded) OAuth callback: Meta redirects the browser here with a
// `code` + signed `state`. We store the shop's tokens, then bounce the browser
// back to the dashboard. No JWT is possible on this hop, hence no guard.
@Controller("content/social/meta")
export class MetaOauthController {
  constructor(private readonly social: SocialService) {}

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const redirectTo = await this.social.handleMetaCallback(code, state, error);
    res.redirect(redirectTo);
  }
}
