import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DatabaseModule } from "./common/database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { AiModule } from "./modules/ai/ai.module";
import { AskModule } from "./modules/ask/ask.module";
import { ShopsModule } from "./modules/shops/shops.module";
import { UsersModule } from "./modules/users/users.module";
import { AccessModule } from "./modules/access/access.module";
import { AutomationsModule } from "./modules/automations/automations.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { DealsModule } from "./modules/deals/deals.module";
import { RfqsModule } from "./modules/rfqs/rfqs.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { ActivitiesModule } from "./modules/activities/activities.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CronModule } from "./cron/cron.module";
import { AppController } from "./app.controller";
import { env } from "./common/config/env";

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({ global: true, secret: env.JWT_SECRET, signOptions: { expiresIn: env.JWT_EXPIRES_IN } }),
    AuditLogsModule,
    AuthModule,
    ShopsModule,
    UsersModule,
    AccessModule,
    AiModule,
    AskModule,
    AutomationsModule,
    CompaniesModule,
    DealsModule,
    RfqsModule,
    QuotesModule,
    TasksModule,
    ActivitiesModule,
    DashboardModule,
    CronModule
  ],
  controllers: [AppController]
})
export class AppModule {}
