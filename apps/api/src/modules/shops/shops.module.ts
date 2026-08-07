import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { ShopsController } from "./shops.controller";
import { ShopsService } from "./shops.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [ShopsController],
  providers: [ShopsService]
})
export class ShopsModule {}
