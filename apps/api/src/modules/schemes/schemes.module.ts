import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { SchemesController } from "./schemes.controller";
import { SchemesService } from "./schemes.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [SchemesController],
  providers: [SchemesService],
  exports: [SchemesService]
})
export class SchemesModule {}
