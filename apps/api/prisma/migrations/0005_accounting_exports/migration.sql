CREATE TYPE "AccountingProvider" AS ENUM ('tally', 'vyapar');
CREATE TYPE "AccountingExportType" AS ENUM ('sales_invoices', 'payments', 'customers', 'inventory_items', 'audit_books');
CREATE TYPE "AccountingExportStatus" AS ENUM ('pending', 'generated', 'failed');

CREATE TABLE "accounting_exports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "provider" "AccountingProvider" NOT NULL,
  "export_type" "AccountingExportType" NOT NULL,
  "status" "AccountingExportStatus" NOT NULL DEFAULT 'pending',
  "date_from" DATE,
  "date_to" DATE,
  "file_name" TEXT,
  "file_url" TEXT,
  "record_count" INTEGER NOT NULL DEFAULT 0,
  "filters" JSONB,
  "error_message" TEXT,
  "exported_by" UUID NOT NULL,
  "exported_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_exports_shop_id_idx" ON "accounting_exports"("shop_id");
CREATE INDEX "accounting_exports_shop_id_provider_idx" ON "accounting_exports"("shop_id", "provider");
CREATE INDEX "accounting_exports_shop_id_export_type_idx" ON "accounting_exports"("shop_id", "export_type");

ALTER TABLE "accounting_exports" ADD CONSTRAINT "accounting_exports_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
