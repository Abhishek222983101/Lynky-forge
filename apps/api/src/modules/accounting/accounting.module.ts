import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService]
})
export class AccountingModule {}
