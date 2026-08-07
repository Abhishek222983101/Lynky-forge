CREATE TYPE "CustomerType" AS ENUM ('retail', 'wholesale');
CREATE TYPE "FollowUpType" AS ENUM ('thank_you', 'festival', 'anniversary', 'win_back', 'scheme_due', 'repair_ready', 'manual');
CREATE TYPE "FollowUpStatus" AS ENUM ('due', 'scheduled', 'sent', 'skipped');
CREATE TYPE "SavingsSchemeStatus" AS ENUM ('active', 'matured', 'closed', 'cancelled');
CREATE TYPE "RepairOrderStatus" AS ENUM ('received', 'in_workshop', 'ready', 'delivered', 'cancelled');
CREATE TYPE "ScanBillStatus" AS ENUM ('received', 'extracted', 'awaiting_confirmation', 'converted', 'failed', 'cancelled');
CREATE TYPE "BuybackItemStatus" AS ENUM ('recorded', 'bundled', 'flagged', 'settled');
CREATE TYPE "AuditBookStatus" AS ENUM ('included', 'excluded');
CREATE TYPE "AccessSection" AS ENUM ('home', 'owner_cockpit', 'customers', 'invoices', 'inventory', 'workshop', 'content', 'audit_books', 'team', 'buyback', 'schemes', 'repairs');

ALTER TABLE "customers"
  ADD COLUMN "customer_type" "CustomerType" NOT NULL DEFAULT 'retail',
  ADD COLUMN "company_name" TEXT,
  ADD COLUMN "birthday" DATE,
  ADD COLUMN "anniversary_date" DATE,
  ADD COLUMN "tags" JSONB,
  ADD COLUMN "preferences" JSONB,
  ADD COLUMN "message_opt_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consent_at" TIMESTAMP(3),
  ADD COLUMN "imported_at" TIMESTAMP(3);

CREATE TABLE "customer_follow_ups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "type" "FollowUpType" NOT NULL,
  "status" "FollowUpStatus" NOT NULL DEFAULT 'due',
  "due_at" TIMESTAMP(3) NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "savings_schemes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "scheme_number" TEXT NOT NULL,
  "monthly_amount" DECIMAL(14,2) NOT NULL,
  "months" INTEGER NOT NULL,
  "start_date" DATE NOT NULL,
  "maturity_date" DATE NOT NULL,
  "status" "SavingsSchemeStatus" NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "savings_schemes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheme_installments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "scheme_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "payment_method" "PaymentMethod" NOT NULL,
  "reference_number" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheme_installments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "repair_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "item_description" TEXT NOT NULL,
  "purity" TEXT,
  "expected_date" DATE,
  "status" "RepairOrderStatus" NOT NULL DEFAULT 'received',
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "repair_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "repair_status_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "repair_order_id" UUID NOT NULL,
  "status" "RepairOrderStatus" NOT NULL,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "metal" TEXT NOT NULL,
  "ornament_type" TEXT NOT NULL,
  "quantity_weight" DECIMAL(12,3) NOT NULL,
  "order_value" DECIMAL(14,2) NOT NULL,
  "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "distributor_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scan_bill_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "status" "ScanBillStatus" NOT NULL DEFAULT 'received',
  "source_file_url" TEXT,
  "raw_text" TEXT,
  "extracted_payload" JSONB,
  "created_customer_id" UUID,
  "created_sale_id" UUID,
  "created_invoice_id" UUID,
  "failure_reason" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_bill_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyback_bundles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "bundle_number" TEXT NOT NULL,
  "metal" TEXT NOT NULL,
  "purity" TEXT NOT NULL,
  "rate_per_gram" DECIMAL(14,2) NOT NULL,
  "total_weight" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "buyback_bundles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyback_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "bundle_id" UUID,
  "customer_id" UUID,
  "item_name" TEXT NOT NULL,
  "tested_purity" TEXT NOT NULL,
  "assigned_purity" TEXT,
  "weight" DECIMAL(12,3) NOT NULL,
  "rate_per_gram" DECIMAL(14,2) NOT NULL,
  "calculated_value" DECIMAL(14,2) NOT NULL,
  "expected_value" DECIMAL(14,2),
  "mismatch_amount" DECIMAL(14,2),
  "status" "BuybackItemStatus" NOT NULL DEFAULT 'recorded',
  "testing_form_url" TEXT,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "buyback_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_book_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "sale_id" UUID,
  "invoice_id" UUID,
  "status" "AuditBookStatus" NOT NULL DEFAULT 'included',
  "notes" TEXT,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audit_book_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_section_access" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "section" "AccessSection" NOT NULL,
  "can_access" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_section_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "metal_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID,
  "metal" TEXT NOT NULL,
  "purity" TEXT,
  "rate_per_unit" DECIMAL(14,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'gram',
  "source" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metal_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_shop_id_customer_type_idx" ON "customers"("shop_id", "customer_type");
CREATE INDEX "customer_follow_ups_shop_id_idx" ON "customer_follow_ups"("shop_id");
CREATE INDEX "customer_follow_ups_shop_id_status_due_at_idx" ON "customer_follow_ups"("shop_id", "status", "due_at");
CREATE INDEX "customer_follow_ups_customer_id_idx" ON "customer_follow_ups"("customer_id");
CREATE UNIQUE INDEX "savings_schemes_shop_id_scheme_number_key" ON "savings_schemes"("shop_id", "scheme_number");
CREATE INDEX "savings_schemes_shop_id_idx" ON "savings_schemes"("shop_id");
CREATE INDEX "savings_schemes_shop_id_customer_id_idx" ON "savings_schemes"("shop_id", "customer_id");
CREATE INDEX "savings_schemes_shop_id_status_idx" ON "savings_schemes"("shop_id", "status");
CREATE INDEX "scheme_installments_shop_id_idx" ON "scheme_installments"("shop_id");
CREATE INDEX "scheme_installments_scheme_id_idx" ON "scheme_installments"("scheme_id");
CREATE UNIQUE INDEX "repair_orders_shop_id_order_number_key" ON "repair_orders"("shop_id", "order_number");
CREATE INDEX "repair_orders_shop_id_idx" ON "repair_orders"("shop_id");
CREATE INDEX "repair_orders_shop_id_customer_id_idx" ON "repair_orders"("shop_id", "customer_id");
CREATE INDEX "repair_orders_shop_id_status_idx" ON "repair_orders"("shop_id", "status");
CREATE INDEX "repair_status_events_shop_id_idx" ON "repair_status_events"("shop_id");
CREATE INDEX "repair_status_events_repair_order_id_idx" ON "repair_status_events"("repair_order_id");
CREATE UNIQUE INDEX "distributor_orders_shop_id_order_number_key" ON "distributor_orders"("shop_id", "order_number");
CREATE INDEX "distributor_orders_shop_id_idx" ON "distributor_orders"("shop_id");
CREATE INDEX "distributor_orders_shop_id_customer_id_idx" ON "distributor_orders"("shop_id", "customer_id");
CREATE INDEX "scan_bill_jobs_shop_id_idx" ON "scan_bill_jobs"("shop_id");
CREATE INDEX "scan_bill_jobs_shop_id_status_idx" ON "scan_bill_jobs"("shop_id", "status");
CREATE UNIQUE INDEX "buyback_bundles_shop_id_bundle_number_key" ON "buyback_bundles"("shop_id", "bundle_number");
CREATE INDEX "buyback_bundles_shop_id_idx" ON "buyback_bundles"("shop_id");
CREATE INDEX "buyback_items_shop_id_idx" ON "buyback_items"("shop_id");
CREATE INDEX "buyback_items_shop_id_bundle_id_idx" ON "buyback_items"("shop_id", "bundle_id");
CREATE INDEX "buyback_items_shop_id_customer_id_idx" ON "buyback_items"("shop_id", "customer_id");
CREATE INDEX "buyback_items_shop_id_status_idx" ON "buyback_items"("shop_id", "status");
CREATE UNIQUE INDEX "audit_book_entries_sale_id_key" ON "audit_book_entries"("sale_id");
CREATE UNIQUE INDEX "audit_book_entries_invoice_id_key" ON "audit_book_entries"("invoice_id");
CREATE INDEX "audit_book_entries_shop_id_idx" ON "audit_book_entries"("shop_id");
CREATE INDEX "audit_book_entries_shop_id_status_idx" ON "audit_book_entries"("shop_id", "status");
CREATE UNIQUE INDEX "user_section_access_user_id_section_key" ON "user_section_access"("user_id", "section");
CREATE INDEX "user_section_access_shop_id_idx" ON "user_section_access"("shop_id");
CREATE INDEX "user_section_access_shop_id_section_idx" ON "user_section_access"("shop_id", "section");
CREATE INDEX "metal_rates_shop_id_idx" ON "metal_rates"("shop_id");
CREATE INDEX "metal_rates_metal_purity_idx" ON "metal_rates"("metal", "purity");

ALTER TABLE "customer_follow_ups" ADD CONSTRAINT "customer_follow_ups_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_follow_ups" ADD CONSTRAINT "customer_follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "savings_schemes" ADD CONSTRAINT "savings_schemes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "savings_schemes" ADD CONSTRAINT "savings_schemes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scheme_installments" ADD CONSTRAINT "scheme_installments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scheme_installments" ADD CONSTRAINT "scheme_installments_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "savings_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "repair_status_events" ADD CONSTRAINT "repair_status_events_repair_order_id_fkey" FOREIGN KEY ("repair_order_id") REFERENCES "repair_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "distributor_orders" ADD CONSTRAINT "distributor_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "distributor_orders" ADD CONSTRAINT "distributor_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scan_bill_jobs" ADD CONSTRAINT "scan_bill_jobs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "buyback_bundles" ADD CONSTRAINT "buyback_bundles_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "buyback_items" ADD CONSTRAINT "buyback_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "buyback_items" ADD CONSTRAINT "buyback_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "buyback_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "buyback_items" ADD CONSTRAINT "buyback_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_book_entries" ADD CONSTRAINT "audit_book_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_book_entries" ADD CONSTRAINT "audit_book_entries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_book_entries" ADD CONSTRAINT "audit_book_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_section_access" ADD CONSTRAINT "user_section_access_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_section_access" ADD CONSTRAINT "user_section_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
