CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "StorageMode" AS ENUM ('shared_cloud', 'private_cloud', 'on_premise');
CREATE TYPE "UserRole" AS ENUM ('owner', 'salesperson', 'workshop_manager', 'admin');
CREATE TYPE "InventoryStatus" AS ENUM ('available', 'sold', 'reserved', 'in_workshop', 'inactive');
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'partial', 'pending');
CREATE TYPE "Source" AS ENUM ('manual', 'voice_app', 'whatsapp_voice');
CREATE TYPE "ConfirmationStatus" AS ENUM ('confirmed', 'cancelled');
CREATE TYPE "MakingChargeType" AS ENUM ('percentage', 'fixed');
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'upi', 'card', 'bank_transfer', 'other');
CREATE TYPE "PendingPaymentStatus" AS ENUM ('open', 'partially_paid', 'closed', 'written_off');
CREATE TYPE "EInvoiceStatus" AS ENUM ('not_required', 'pending', 'pending_generation', 'generated', 'failed');
CREATE TYPE "VoiceSource" AS ENUM ('app_speak', 'whatsapp_voice');
CREATE TYPE "VoiceIntent" AS ENUM ('record_sale', 'ask_owner_question', 'record_payment', 'unknown');
CREATE TYPE "VoiceStatus" AS ENUM ('received', 'parsed', 'awaiting_confirmation', 'confirmed', 'cancelled', 'failed');

CREATE TABLE "shops" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "gst_number" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "default_language" TEXT NOT NULL DEFAULT 'ta-IN',
  "storage_mode" "StorageMode" NOT NULL DEFAULT 'shared_cloud',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID,
  "full_name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "phone" TEXT,
  "preferred_language" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "purity" TEXT NOT NULL,
  "huid_number" TEXT,
  "gross_weight" DECIMAL(12,3),
  "net_weight" DECIMAL(12,3),
  "status" "InventoryStatus" NOT NULL DEFAULT 'available',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID,
  "sale_number" TEXT NOT NULL,
  "sale_date" DATE NOT NULL,
  "subtotal_amount" DECIMAL(14,2) NOT NULL,
  "making_charge_amount" DECIMAL(14,2) NOT NULL,
  "hallmarking_charge_amount" DECIMAL(14,2) NOT NULL,
  "gst_amount" DECIMAL(14,2) NOT NULL,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "amount_paid" DECIMAL(14,2) NOT NULL,
  "pending_amount" DECIMAL(14,2) NOT NULL,
  "payment_status" "PaymentStatus" NOT NULL,
  "source" "Source" NOT NULL,
  "confirmation_status" "ConfirmationStatus" NOT NULL DEFAULT 'confirmed',
  "confirmed_by" UUID NOT NULL,
  "confirmed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "inventory_item_id" UUID,
  "item_name" TEXT NOT NULL,
  "purity" TEXT NOT NULL,
  "gross_weight" DECIMAL(12,3) NOT NULL,
  "net_weight" DECIMAL(12,3) NOT NULL,
  "gold_rate_per_gram" DECIMAL(14,2) NOT NULL,
  "making_charge_type" "MakingChargeType" NOT NULL,
  "making_charge_value" DECIMAL(12,2) NOT NULL,
  "making_charge_amount" DECIMAL(14,2) NOT NULL,
  "hallmarking_charge_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "line_subtotal" DECIMAL(14,2) NOT NULL,
  "gst_amount" DECIMAL(14,2) NOT NULL,
  "line_total" DECIMAL(14,2) NOT NULL,
  "huid_number" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "sale_id" UUID,
  "customer_id" UUID,
  "amount" DECIMAL(14,2) NOT NULL,
  "payment_method" "PaymentMethod" NOT NULL,
  "payment_date" DATE NOT NULL,
  "reference_number" TEXT,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pending_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "customer_id" UUID,
  "amount" DECIMAL(14,2) NOT NULL,
  "due_date" DATE,
  "status" "PendingPaymentStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "gst_number" TEXT,
  "taxable_amount" DECIMAL(14,2) NOT NULL,
  "gst_amount" DECIMAL(14,2) NOT NULL,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "pdf_url" TEXT,
  "e_invoice_status" "EInvoiceStatus" NOT NULL DEFAULT 'pending_generation',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source" "VoiceSource" NOT NULL,
  "raw_transcript" TEXT,
  "normalized_text" TEXT,
  "detected_language" TEXT,
  "intent" "VoiceIntent" NOT NULL DEFAULT 'unknown',
  "status" "VoiceStatus" NOT NULL DEFAULT 'received',
  "extracted_payload" JSONB,
  "confirmation_message" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "before_data" JSONB,
  "after_data" JSONB,
  "source" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "event_name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "customers_shop_id_phone_key" ON "customers"("shop_id", "phone");
CREATE UNIQUE INDEX "sales_shop_id_sale_number_key" ON "sales"("shop_id", "sale_number");
CREATE UNIQUE INDEX "pending_payments_sale_id_key" ON "pending_payments"("sale_id");
CREATE UNIQUE INDEX "invoices_sale_id_key" ON "invoices"("sale_id");
CREATE UNIQUE INDEX "invoices_shop_id_invoice_number_key" ON "invoices"("shop_id", "invoice_number");

CREATE INDEX "users_shop_id_idx" ON "users"("shop_id");
CREATE INDEX "customers_shop_id_idx" ON "customers"("shop_id");
CREATE INDEX "inventory_items_shop_id_idx" ON "inventory_items"("shop_id");
CREATE INDEX "sales_shop_id_idx" ON "sales"("shop_id");
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");
CREATE INDEX "sale_items_shop_id_idx" ON "sale_items"("shop_id");
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");
CREATE INDEX "payments_shop_id_idx" ON "payments"("shop_id");
CREATE INDEX "payments_sale_id_idx" ON "payments"("sale_id");
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");
CREATE INDEX "pending_payments_shop_id_idx" ON "pending_payments"("shop_id");
CREATE INDEX "pending_payments_customer_id_idx" ON "pending_payments"("customer_id");
CREATE INDEX "invoices_shop_id_idx" ON "invoices"("shop_id");
CREATE INDEX "voice_sessions_shop_id_idx" ON "voice_sessions"("shop_id");
CREATE INDEX "voice_sessions_user_id_idx" ON "voice_sessions"("user_id");
CREATE INDEX "audit_logs_shop_id_idx" ON "audit_logs"("shop_id");
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "internal_events_shop_id_idx" ON "internal_events"("shop_id");
CREATE INDEX "internal_events_event_name_idx" ON "internal_events"("event_name");

ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
