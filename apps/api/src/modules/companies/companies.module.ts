import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { ContactsController } from "./contacts.controller";

@Module({
  imports: [AuditLogsModule],
  controllers: [CompaniesController, ContactsController],
  providers: [CompaniesService],
  exports: [CompaniesService]
})
export class CompaniesModule {}
