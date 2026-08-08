-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'salesperson', 'workshop_manager', 'admin');

-- CreateEnum
CREATE TYPE "StorageMode" AS ENUM ('shared_cloud', 'private_cloud', 'on_premise');

-- CreateEnum
CREATE TYPE "AccessSection" AS ENUM ('home', 'dashboard', 'pipeline', 'companies', 'rfqs', 'quotes', 'tasks', 'ask', 'team');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NEW_RFQ', 'CONTACTED', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('FOLLOW_UP', 'CALL', 'SEND_QUOTE', 'RENEGOTIATE', 'MEETING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DUE', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'STAGE_CHANGE', 'QUOTE_SENT', 'EMAIL', 'CALL', 'TASK_CREATED', 'DEAL_WON', 'DEAL_LOST');

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('AUTOMOTIVE', 'AEROSPACE', 'ELECTRONICS', 'MEDICAL', 'INDUSTRIAL');

-- CreateEnum
CREATE TYPE "LeadScore" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "DealSource" AS ENUM ('WEBSITE', 'REFERRAL', 'COLD_OUTREACH', 'TRADE_SHOW', 'RFQ_PORTAL');

-- CreateEnum
CREATE TYPE "RfqSource" AS ENUM ('WEBSITE', 'EMAIL', 'PHONE', 'WHATSAPP', 'REFERRAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "gst_number" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "default_language" TEXT NOT NULL DEFAULT 'en-IN',
    "storage_mode" "StorageMode" NOT NULL DEFAULT 'shared_cloud',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "social_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "user_section_access" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "section" "AccessSection" NOT NULL,
    "can_access" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_section_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "internal_events" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" "Industry" NOT NULL,
    "city" TEXT,
    "size" TEXT,
    "website" TEXT,
    "annual_potential" DECIMAL(14,2),
    "source" "DealSource",
    "tags" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "owner_id" UUID,
    "value" DECIMAL(14,2) NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'NEW_RFQ',
    "expected_close" DATE,
    "lost_reason" TEXT,
    "source" "DealSource",
    "lead_score" "LeadScore" NOT NULL DEFAULT 'WARM',
    "lead_score_reason" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "part_name" TEXT NOT NULL,
    "part_no" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "tolerance" TEXT,
    "target_price" DECIMAL(14,2),
    "deadline" DATE NOT NULL,
    "drawing_notes" TEXT,
    "source" "RfqSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "companyId" UUID,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "quote_no" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(14,2) NOT NULL,
    "valid_until" DATE NOT NULL,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "line_items" JSONB NOT NULL,
    "terms" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "deal_id" UUID,
    "company_id" UUID,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DUE',
    "due_at" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "auto_created" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "deal_id" UUID,
    "company_id" UUID,
    "type" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "order_no" TEXT NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_quote_cache" (
    "id" UUID NOT NULL,
    "rfq_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_quote_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ask_cache" (
    "id" UUID NOT NULL,
    "question_hash" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_snapshots" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "pipeline_value" DECIMAL(14,2) NOT NULL,
    "deals_open" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_shop_id_idx" ON "users"("shop_id");

-- CreateIndex
CREATE INDEX "user_section_access_shop_id_idx" ON "user_section_access"("shop_id");

-- CreateIndex
CREATE INDEX "user_section_access_shop_id_section_idx" ON "user_section_access"("shop_id", "section");

-- CreateIndex
CREATE UNIQUE INDEX "user_section_access_user_id_section_key" ON "user_section_access"("user_id", "section");

-- CreateIndex
CREATE INDEX "audit_logs_shop_id_idx" ON "audit_logs"("shop_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "internal_events_shop_id_idx" ON "internal_events"("shop_id");

-- CreateIndex
CREATE INDEX "internal_events_event_name_idx" ON "internal_events"("event_name");

-- CreateIndex
CREATE INDEX "companies_shop_id_idx" ON "companies"("shop_id");

-- CreateIndex
CREATE INDEX "companies_shop_id_industry_idx" ON "companies"("shop_id", "industry");

-- CreateIndex
CREATE INDEX "contacts_shop_id_idx" ON "contacts"("shop_id");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

-- CreateIndex
CREATE INDEX "deals_shop_id_idx" ON "deals"("shop_id");

-- CreateIndex
CREATE INDEX "deals_shop_id_stage_idx" ON "deals"("shop_id", "stage");

-- CreateIndex
CREATE INDEX "deals_shop_id_lead_score_idx" ON "deals"("shop_id", "lead_score");

-- CreateIndex
CREATE INDEX "deals_shop_id_expected_close_idx" ON "deals"("shop_id", "expected_close");

-- CreateIndex
CREATE INDEX "deals_shop_id_company_id_idx" ON "deals"("shop_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_deal_id_key" ON "rfqs"("deal_id");

-- CreateIndex
CREATE INDEX "rfqs_shop_id_idx" ON "rfqs"("shop_id");

-- CreateIndex
CREATE INDEX "rfqs_deal_id_idx" ON "rfqs"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_deal_id_key" ON "quotes"("deal_id");

-- CreateIndex
CREATE INDEX "quotes_shop_id_idx" ON "quotes"("shop_id");

-- CreateIndex
CREATE INDEX "quotes_deal_id_idx" ON "quotes"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_shop_id_quote_no_key" ON "quotes"("shop_id", "quote_no");

-- CreateIndex
CREATE INDEX "tasks_shop_id_idx" ON "tasks"("shop_id");

-- CreateIndex
CREATE INDEX "tasks_shop_id_status_due_at_idx" ON "tasks"("shop_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_deal_id_idx" ON "tasks"("deal_id");

-- CreateIndex
CREATE INDEX "tasks_company_id_idx" ON "tasks"("company_id");

-- CreateIndex
CREATE INDEX "activities_shop_id_idx" ON "activities"("shop_id");

-- CreateIndex
CREATE INDEX "activities_deal_id_created_at_idx" ON "activities"("deal_id", "created_at");

-- CreateIndex
CREATE INDEX "activities_company_id_created_at_idx" ON "activities"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_deal_id_key" ON "orders"("deal_id");

-- CreateIndex
CREATE INDEX "orders_shop_id_idx" ON "orders"("shop_id");

-- CreateIndex
CREATE INDEX "orders_deal_id_idx" ON "orders"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_order_no_key" ON "orders"("shop_id", "order_no");

-- CreateIndex
CREATE UNIQUE INDEX "ai_quote_cache_rfq_hash_key" ON "ai_quote_cache"("rfq_hash");

-- CreateIndex
CREATE UNIQUE INDEX "ask_cache_question_hash_key" ON "ask_cache"("question_hash");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_snapshots_date_key" ON "dashboard_snapshots"("date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_section_access" ADD CONSTRAINT "user_section_access_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_section_access" ADD CONSTRAINT "user_section_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
