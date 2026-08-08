import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AiModule } from "@/modules/ai/ai.module";
import { AutomationsModule } from "@/modules/automations/automations.module";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [AuditLogsModule, AutomationsModule, AiModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService]
})
export class QuotesModule {}
