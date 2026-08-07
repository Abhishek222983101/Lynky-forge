CREATE TYPE "StockMovementType" AS ENUM ('stock_in', 'stock_out', 'sale', 'reserve', 'unreserve', 'workshop_issue', 'workshop_receive', 'adjustment', 'return');
CREATE TYPE "KarigarJobStatus" AS ENUM ('open', 'partially_returned', 'returned', 'cancelled');
CREATE TYPE "ContentRequestStatus" AS ENUM ('requested', 'processing', 'ready', 'failed', 'cancelled');
CREATE TYPE "ContentAssetType" AS ENUM ('still', 'reel', 'caption');

ALTER TABLE "inventory_items"
  ADD COLUMN "estimated_value" DECIMAL(14,2),
  ADD COLUMN "acquisition_date" DATE,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "photo_url" TEXT;

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "inventory_item_id" UUID,
  "movement_type" "StockMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "weight" DECIMAL(12,3),
  "from_status" "InventoryStatus",
  "to_status" "InventoryStatus",
  "reference_type" TEXT,
  "reference_id" UUID,
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "karigars" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "specialization" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "karigars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "karigar_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "karigar_id" UUID NOT NULL,
  "inventory_item_id" UUID,
  "job_number" TEXT,
  "item_description" TEXT NOT NULL,
  "purity" TEXT NOT NULL,
  "issued_weight" DECIMAL(12,3) NOT NULL,
  "issued_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_date" DATE,
  "status" "KarigarJobStatus" NOT NULL DEFAULT 'open',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "karigar_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "karigar_returns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "karigar_job_id" UUID NOT NULL,
  "finished_weight" DECIMAL(12,3) NOT NULL,
  "scrap_weight" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "wastage_weight" DECIMAL(12,3) NOT NULL,
  "wastage_percent" DECIMAL(8,3) NOT NULL,
  "flagged" BOOLEAN NOT NULL DEFAULT false,
  "return_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "karigar_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "inventory_item_id" UUID,
  "occasion" TEXT,
  "requested_by" UUID NOT NULL,
  "status" "ContentRequestStatus" NOT NULL DEFAULT 'requested',
  "prompt" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "content_request_id" UUID NOT NULL,
  "asset_type" "ContentAssetType" NOT NULL,
  "url" TEXT,
  "caption" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_items_shop_id_status_idx" ON "inventory_items"("shop_id", "status");
CREATE INDEX "stock_movements_shop_id_idx" ON "stock_movements"("shop_id");
CREATE INDEX "stock_movements_shop_id_inventory_item_id_idx" ON "stock_movements"("shop_id", "inventory_item_id");
CREATE INDEX "stock_movements_shop_id_movement_type_idx" ON "stock_movements"("shop_id", "movement_type");
CREATE INDEX "karigars_shop_id_idx" ON "karigars"("shop_id");
CREATE UNIQUE INDEX "karigar_jobs_shop_id_job_number_key" ON "karigar_jobs"("shop_id", "job_number");
CREATE INDEX "karigar_jobs_shop_id_idx" ON "karigar_jobs"("shop_id");
CREATE INDEX "karigar_jobs_shop_id_karigar_id_idx" ON "karigar_jobs"("shop_id", "karigar_id");
CREATE INDEX "karigar_returns_shop_id_idx" ON "karigar_returns"("shop_id");
CREATE INDEX "karigar_returns_shop_id_karigar_job_id_idx" ON "karigar_returns"("shop_id", "karigar_job_id");
CREATE INDEX "content_requests_shop_id_idx" ON "content_requests"("shop_id");
CREATE INDEX "content_requests_shop_id_inventory_item_id_idx" ON "content_requests"("shop_id", "inventory_item_id");
CREATE INDEX "content_assets_shop_id_idx" ON "content_assets"("shop_id");
CREATE INDEX "content_assets_content_request_id_idx" ON "content_assets"("content_request_id");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "karigars" ADD CONSTRAINT "karigars_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "karigar_jobs" ADD CONSTRAINT "karigar_jobs_karigar_id_fkey" FOREIGN KEY ("karigar_id") REFERENCES "karigars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "karigar_jobs" ADD CONSTRAINT "karigar_jobs_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "karigar_returns" ADD CONSTRAINT "karigar_returns_karigar_job_id_fkey" FOREIGN KEY ("karigar_job_id") REFERENCES "karigar_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_requests" ADD CONSTRAINT "content_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_requests" ADD CONSTRAINT "content_requests_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_content_request_id_fkey" FOREIGN KEY ("content_request_id") REFERENCES "content_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
