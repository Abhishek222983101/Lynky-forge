import { Module } from "@nestjs/common";
import { CronController } from "./scan-overdue.controller";

@Module({
  controllers: [CronController],
})
export class CronModule {}
