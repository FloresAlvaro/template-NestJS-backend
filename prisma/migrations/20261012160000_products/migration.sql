-- CreateTable
CREATE TABLE "Product" (
    "productId" SERIAL NOT NULL,
    "subCategoryId" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "barcode" VARCHAR(64),
    "description" VARCHAR(1000),
    "cost" DECIMAL(18,2) NOT NULL,
    "salePrice" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_subCategoryId_isActive_idx" ON "Product"("subCategoryId", "isActive");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("subCategoryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Protect monetary values and SKU identity even for writes outside the API.
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_nonnegative" CHECK ("cost" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_salePrice_nonnegative" CHECK ("salePrice" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_sku_canonical" CHECK ("sku" = UPPER(BTRIM("sku")) AND "sku" ~ '^[A-Z0-9][A-Z0-9._-]*$');
