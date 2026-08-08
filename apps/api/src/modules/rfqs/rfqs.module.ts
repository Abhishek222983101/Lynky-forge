import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { RfqsController } from "./rfqs.controller";
import { RfqsService } from "./rfqs.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [RfqsController],
  providers: [RfqsService],
  exports: [RfqsService]
})
export class RfqsModule {}
