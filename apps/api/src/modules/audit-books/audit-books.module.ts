import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { AuditBooksController } from "./audit-books.controller";
import { AuditBooksService } from "./audit-books.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [AuditBooksController],
  providers: [AuditBooksService],
  exports: [AuditBooksService]
})
export class AuditBooksModule {}
