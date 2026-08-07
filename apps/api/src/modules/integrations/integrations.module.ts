import { Module } from "@nestjs/common";
import { EventsService } from "./events/events.service";
import { GoldRateClient } from "./gold-rate/gold-rate.client";
import { SarvamSttClient } from "./sarvam/sarvam-stt.client";
import { SarvamTtsClient } from "./sarvam/sarvam-tts.client";

@Module({
  providers: [GoldRateClient, EventsService, SarvamSttClient, SarvamTtsClient],
  exports: [GoldRateClient, EventsService, SarvamSttClient, SarvamTtsClient]
})
export class IntegrationsModule {}
