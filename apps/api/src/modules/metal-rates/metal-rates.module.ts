import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { IntegrationsModule } from "@/modules/integrations/integrations.module";
import { MetalRatesController } from "./metal-rates.controller";
import { MetalRatesService } from "./metal-rates.service";

@Module({
  imports: [AuditLogsModule, IntegrationsModule],
  controllers: [MetalRatesController],
  providers: [MetalRatesService]
})
export class MetalRatesModule {}
