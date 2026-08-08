import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AskController } from "./ask.controller";
import { AskService } from "./ask.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [AskController],
  providers: [AskService],
  exports: [AskService]
})
export class AskModule {}
