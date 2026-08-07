import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { BillingModule } from "@/modules/billing/billing.module";
import { SalesModule } from "@/modules/sales/sales.module";
import { ScanBillController } from "./scan-bill.controller";
import { ScanBillService } from "./scan-bill.service";

@Module({
  imports: [AuditLogsModule, BillingModule, SalesModule],
  controllers: [ScanBillController],
  providers: [ScanBillService]
})
export class ScanBillModule {}
