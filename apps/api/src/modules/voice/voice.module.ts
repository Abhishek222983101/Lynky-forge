import { Module } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AccountingModule } from "@/modules/accounting/accounting.module";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { BillingModule } from "@/modules/billing/billing.module";
import { BuybackModule } from "@/modules/buyback/buyback.module";
import { ContentModule } from "@/modules/content/content.module";
import { CustomersModule } from "@/modules/customers/customers.module";
import { IntegrationsModule } from "@/modules/integrations/integrations.module";
import { InventoryModule } from "@/modules/inventory/inventory.module";
import { KarigarModule } from "@/modules/karigar/karigar.module";
import { OwnerCockpitModule } from "@/modules/owner-cockpit/owner-cockpit.module";
import { RepairsModule } from "@/modules/repairs/repairs.module";
import { SalesModule } from "@/modules/sales/sales.module";
import { SchemesModule } from "@/modules/schemes/schemes.module";
import { DeterministicVoiceRouter } from "./router/deterministic-voice-router";
import { LlmVoiceRouter } from "./router/llm-voice-router";
import { VOICE_ROUTER } from "./router/voice-router";
import { VoiceCommandBusService } from "./voice-command-bus.service";
import { VoiceController } from "./voice.controller";
import { VoicePolicyService } from "./voice-policy.service";
import { VoiceLookupService } from "./voice-lookup.service";
import { VoicePreviewService } from "./voice-preview.service";
import { VoiceResolverService } from "./voice-resolver.service";
import { GeminiLiveGateway } from "./gemini/gemini-live.gateway";
import { VoiceService } from "./voice.service";

@Module({
  imports: [
    AccountingModule,
    AuditLogsModule,
    BillingModule,
    BuybackModule,
    ContentModule,
    CustomersModule,
    IntegrationsModule,
    InventoryModule,
    KarigarModule,
    OwnerCockpitModule,
    RepairsModule,
    SalesModule,
    SchemesModule
  ],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    VoiceCommandBusService,
    VoicePolicyService,
    VoiceResolverService,
    VoicePreviewService,
    VoiceLookupService,
    GeminiLiveGateway,
    DeterministicVoiceRouter,
    LlmVoiceRouter,
    {
      // Deterministic offline router by default; Sarvam LLM router when configured.
      provide: VOICE_ROUTER,
      useFactory: (deterministic: DeterministicVoiceRouter, llm: LlmVoiceRouter) =>
        env.VOICE_INTENT_PROVIDER === "sarvam" ? llm : deterministic,
      inject: [DeterministicVoiceRouter, LlmVoiceRouter]
    }
  ]
})
export class VoiceModule {}
