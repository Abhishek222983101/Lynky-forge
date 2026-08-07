import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { IntegrationsModule } from "@/modules/integrations/integrations.module";
import { InventoryModule } from "@/modules/inventory/inventory.module";
import { KarigarController } from "./karigar.controller";
import { KarigarService } from "./karigar.service";

@Module({
  imports: [AuditLogsModule, IntegrationsModule, InventoryModule],
  controllers: [KarigarController],
  providers: [KarigarService],
  exports: [KarigarService]
})
export class KarigarModule {}
