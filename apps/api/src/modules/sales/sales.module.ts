import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { BillingModule } from "@/modules/billing/billing.module";
import { IntegrationsModule } from "@/modules/integrations/integrations.module";
import { InventoryModule } from "@/modules/inventory/inventory.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuditLogsModule, BillingModule, IntegrationsModule, InventoryModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService]
})
export class SalesModule {}
