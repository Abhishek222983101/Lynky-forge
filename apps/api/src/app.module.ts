import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DatabaseModule } from "./common/database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { AskModule } from "./modules/ask/ask.module";
import { ShopsModule } from "./modules/shops/shops.module";
import { UsersModule } from "./modules/users/users.module";
import { AccessModule } from "./modules/access/access.module";
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
    AskModule
  ],
  controllers: [AppController]
})
export class AppModule {}
