import { Module } from "@nestjs/common";
import { AutomationsService } from "./automations.service";

@Module({
  providers: [AutomationsService],
  exports: [AutomationsService]
})
export class AutomationsModule {}
