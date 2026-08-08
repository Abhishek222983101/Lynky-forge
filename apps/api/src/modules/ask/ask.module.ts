import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AiModule } from "@/modules/ai/ai.module";
import { AskController } from "./ask.controller";
import { AskService } from "./ask.service";

@Module({
  imports: [AuditLogsModule, AiModule],
  controllers: [AskController],
  providers: [AskService],
  exports: [AskService]
})
export class AskModule {}
