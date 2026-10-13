ALTER TABLE "Customer" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "Sale" (
  "saleId" SERIAL PRIMARY KEY,
  "requestId" UUID NOT NULL UNIQUE,
  "requestHash" VARCHAR(64) NOT NULL,
  "customerId" INTEGER NOT NULL REFERENCES "Customer"("customerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "customerName" VARCHAR(100) NOT NULL,
  "customerDocument" VARCHAR(50),
  "sellerName" VARCHAR(100) NOT NULL,
  "total" DECIMAL(18,2) NOT NULL CHECK ("total" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SaleItem" (
  "saleItemId" SERIAL PRIMARY KEY,
  "saleId" INTEGER NOT NULL REFERENCES "Sale"("saleId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productName" VARCHAR(150) NOT NULL,
  "sku" VARCHAR(64) NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "unitPrice" DECIMAL(18,2) NOT NULL CHECK ("unitPrice" >= 0),
  "subtotal" DECIMAL(18,2) NOT NULL CHECK ("subtotal" = "unitPrice" * "quantity")
);
CREATE UNIQUE INDEX "SaleItem_saleId_productId_key" ON "SaleItem"("saleId", "productId");
CREATE INDEX "Sale_createdAt_saleId_idx" ON "Sale"("createdAt", "saleId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
ALTER TABLE "StockMovement" ADD COLUMN "saleItemId" INTEGER REFERENCES "SaleItem"("saleItemId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "StockMovement_saleItemId_key" ON "StockMovement"("saleItemId");
