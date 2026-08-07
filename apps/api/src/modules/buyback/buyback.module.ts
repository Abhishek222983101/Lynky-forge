import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { BuybackController } from "./buyback.controller";
import { BuybackService } from "./buyback.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [BuybackController],
  providers: [BuybackService],
  exports: [BuybackService]
})
export class BuybackModule {}
