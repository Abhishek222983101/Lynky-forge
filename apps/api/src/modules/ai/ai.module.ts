import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AiService } from "./ai.service";

@Module({
  imports: [AuditLogsModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
