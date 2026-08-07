import { Module } from "@nestjs/common";
import { AuditLogsModule } from "@/modules/audit-logs/audit-logs.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
