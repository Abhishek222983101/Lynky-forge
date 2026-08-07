import { Module } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { IntegrationsModule } from "@/modules/integrations/integrations.module";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";
import { ContentStudioService } from "./studio/content-studio.service";
import { DisclosureService } from "./studio/disclosure";
import { DeterministicContentOrchestrator } from "./studio/deterministic-orchestrator";
import { LlmContentOrchestrator } from "./studio/llm-orchestrator";
import { CONTENT_ORCHESTRATOR } from "./studio/orchestrator";
import { IMAGE_PROVIDER, StubImageProvider } from "./studio/providers/image-provider";
import { GeminiImageProvider } from "./studio/providers/gemini-image.provider";
import { OpenRouterImageProvider } from "./studio/providers/openrouter-image.provider";
import { StubVideoProvider, VIDEO_PROVIDER } from "./studio/providers/video-provider";
import { Veo3VideoProvider } from "./studio/providers/veo3-video.provider";
import { SocialController } from "./social/social.controller";
import { MetaOauthController } from "./social/meta-oauth.controller";
import { SocialService } from "./social/social.service";
import { MetaClient } from "./social/meta.client";

@Module({
  imports: [AuditLogsModule, IntegrationsModule],
  controllers: [ContentController, SocialController, MetaOauthController],
  providers: [
    ContentService,
    ContentStudioService,
    DisclosureService,
    SocialService,
    MetaClient,
    {
      provide: CONTENT_ORCHESTRATOR,
      useClass: env.CONTENT_ORCHESTRATOR_PROVIDER === "sarvam" ? LlmContentOrchestrator : DeterministicContentOrchestrator,
    },
    {
      provide: IMAGE_PROVIDER,
      useClass:
        env.CONTENT_IMAGE_PROVIDER === "gemini"
          ? GeminiImageProvider
          : env.CONTENT_IMAGE_PROVIDER === "openrouter"
            ? OpenRouterImageProvider
            : StubImageProvider,
    },
    {
      provide: VIDEO_PROVIDER,
      useClass: env.CONTENT_VIDEO_PROVIDER === "veo3" ? Veo3VideoProvider : StubVideoProvider,
    },
  ],
  exports: [ContentService, ContentStudioService, SocialService],
})
export class ContentModule {}
