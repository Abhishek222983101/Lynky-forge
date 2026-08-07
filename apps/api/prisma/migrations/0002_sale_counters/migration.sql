CREATE TABLE "sale_counters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "next_sale_number" INTEGER NOT NULL DEFAULT 1,
  "next_invoice_number" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_counters_shop_id_key" ON "sale_counters"("shop_id");

ALTER TABLE "sale_counters" ADD CONSTRAINT "sale_counters_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
