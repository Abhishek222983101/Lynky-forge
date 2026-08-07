import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AccessController } from "./access.controller";
import { AccessService } from "./access.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [AccessController],
  providers: [AccessService]
})
export class AccessModule {}
