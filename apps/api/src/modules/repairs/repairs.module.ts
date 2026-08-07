import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { IntegrationsModule } from "@/modules/integrations/integrations.module";
import { RepairsController } from "./repairs.controller";
import { RepairsService } from "./repairs.service";

@Module({
  imports: [AuditLogsModule, IntegrationsModule],
  controllers: [RepairsController],
  providers: [RepairsService],
  exports: [RepairsService]
})
export class RepairsModule {}
