import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DatabaseModule } from "./common/database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { BillingModule } from "./modules/billing/billing.module";
import { OwnerCockpitModule } from "./modules/owner-cockpit/owner-cockpit.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ShopsModule } from "./modules/shops/shops.module";
import { UsersModule } from "./modules/users/users.module";
import { VoiceModule } from "./modules/voice/voice.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { env } from "./common/config/env";
import { CustomersModule } from "./modules/customers/customers.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { AppController } from "./app.controller";
import { KarigarModule } from "./modules/karigar/karigar.module";
import { ContentModule } from "./modules/content/content.module";
import { SchemesModule } from "./modules/schemes/schemes.module";
import { RepairsModule } from "./modules/repairs/repairs.module";
import { BuybackModule } from "./modules/buyback/buyback.module";
import { AuditBooksModule } from "./modules/audit-books/audit-books.module";
import { ScanBillModule } from "./modules/scan-bill/scan-bill.module";
import { AccessModule } from "./modules/access/access.module";
import { MetalRatesModule } from "./modules/metal-rates/metal-rates.module";
import { AccountingModule } from "./modules/accounting/accounting.module";

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({ global: true, secret: env.JWT_SECRET, signOptions: { expiresIn: env.JWT_EXPIRES_IN } }),
    AuditLogsModule,
    BillingModule,
    IntegrationsModule,
    AuthModule,
    ShopsModule,
    UsersModule,
    CustomersModule,
    SchemesModule,
    RepairsModule,
    InventoryModule,
    KarigarModule,
    ContentModule,
    BuybackModule,
    AuditBooksModule,
    ScanBillModule,
    AccessModule,
    MetalRatesModule,
    AccountingModule,
    PaymentsModule,
    SalesModule,
    VoiceModule,
    OwnerCockpitModule
  ],
  controllers: [AppController]
})
export class AppModule {}
