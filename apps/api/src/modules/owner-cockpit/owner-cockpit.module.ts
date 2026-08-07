import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { SalesModule } from "@/modules/sales/sales.module";
import { OwnerCockpitController } from "./owner-cockpit.controller";
import { OwnerCockpitService } from "./owner-cockpit.service";

@Module({
  imports: [AuditLogsModule, SalesModule],
  controllers: [OwnerCockpitController],
  providers: [OwnerCockpitService],
  exports: [OwnerCockpitService]
})
export class OwnerCockpitModule {}
