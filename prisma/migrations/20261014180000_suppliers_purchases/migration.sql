CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');
CREATE TYPE "PurchaseOperationKind" AS ENUM ('RECEIVE', 'CANCEL');

CREATE TABLE "Supplier" (
 "supplierId" SERIAL PRIMARY KEY,
 "name" VARCHAR(150) NOT NULL,
 "normalizedName" VARCHAR(150) NOT NULL,
 "document" VARCHAR(50),
 "contactName" VARCHAR(100),
 "email" VARCHAR(254),
 "phone" VARCHAR(30),
 "address" VARCHAR(300),
 "notes" VARCHAR(1000),
 "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Supplier_name_check" CHECK (length(trim("name")) >= 2)
);
CREATE UNIQUE INDEX "Supplier_normalizedName_key" ON "Supplier"("normalizedName");
CREATE UNIQUE INDEX "Supplier_document_key" ON "Supplier"("document");

CREATE TABLE "Purchase" (
 "purchaseId" SERIAL PRIMARY KEY,
 "requestId" UUID NOT NULL,
 "requestHash" VARCHAR(64) NOT NULL,
 "supplierId" INTEGER NOT NULL REFERENCES "Supplier"("supplierId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "supplierName" VARCHAR(150) NOT NULL,
 "supplierDocument" VARCHAR(50),
 "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userName" VARCHAR(100) NOT NULL,
 "reference" VARCHAR(100),
 "notes" VARCHAR(1000),
 "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
 "total" DECIMAL(18,2) NOT NULL CHECK ("total" >= 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "receivedAt" TIMESTAMP(3),
 "cancelledAt" TIMESTAMP(3),
 CONSTRAINT "Purchase_status_dates_check" CHECK (
  ("status" = 'PENDING' AND "receivedAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'RECEIVED' AND "receivedAt" IS NOT NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'CANCELLED' AND "receivedAt" IS NULL AND "cancelledAt" IS NOT NULL)
 )
);
CREATE UNIQUE INDEX "Purchase_requestId_key" ON "Purchase"("requestId");
CREATE INDEX "Purchase_supplierId_purchaseId_idx" ON "Purchase"("supplierId", "purchaseId");
CREATE INDEX "Purchase_status_purchaseId_idx" ON "Purchase"("status", "purchaseId");
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

CREATE TABLE "PurchaseItem" (
 "purchaseItemId" SERIAL PRIMARY KEY,
 "purchaseId" INTEGER NOT NULL REFERENCES "Purchase"("purchaseId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "productName" VARCHAR(150) NOT NULL,
 "sku" VARCHAR(64) NOT NULL,
 "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
 "unitCost" DECIMAL(18,2) NOT NULL CHECK ("unitCost" >= 0),
 "subtotal" DECIMAL(18,2) NOT NULL CHECK ("subtotal" >= 0),
 CONSTRAINT "PurchaseItem_subtotal_amount_check" CHECK ("subtotal" = "unitCost" * "quantity")
);
CREATE UNIQUE INDEX "PurchaseItem_purchaseId_productId_key" ON "PurchaseItem"("purchaseId", "productId");
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

CREATE TABLE "PurchaseOperation" (
 "operationId" SERIAL PRIMARY KEY,
 "requestId" UUID NOT NULL,
 "requestHash" VARCHAR(64) NOT NULL,
 "purchaseId" INTEGER NOT NULL REFERENCES "Purchase"("purchaseId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userName" VARCHAR(100) NOT NULL,
 "kind" "PurchaseOperationKind" NOT NULL,
 "reason" VARCHAR(500) NOT NULL,
 "updateCost" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PurchaseOperation_reason_check" CHECK (length(trim("reason")) >= 3),
 CONSTRAINT "PurchaseOperation_cost_check" CHECK ("kind" = 'RECEIVE' OR NOT "updateCost")
);
CREATE UNIQUE INDEX "PurchaseOperation_requestId_key" ON "PurchaseOperation"("requestId");
CREATE UNIQUE INDEX "PurchaseOperation_purchaseId_kind_key" ON "PurchaseOperation"("purchaseId", "kind");
CREATE INDEX "PurchaseOperation_userId_idx" ON "PurchaseOperation"("userId");

ALTER TABLE "StockMovement" ADD COLUMN "purchaseItemId" INTEGER;
CREATE UNIQUE INDEX "StockMovement_purchaseItemId_key" ON "StockMovement"("purchaseItemId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("purchaseItemId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchase_source_check" CHECK (
 "purchaseItemId" IS NULL OR ("type" = 'ENTRY' AND "saleItemId" IS NULL AND "operationItemId" IS NULL)
);
