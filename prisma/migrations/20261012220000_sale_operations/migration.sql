CREATE TYPE "SaleOperationKind" AS ENUM ('PAYMENT', 'REFUND', 'RETURN', 'CANCEL');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');
CREATE TABLE "SaleOperation" (
 "operationId" SERIAL PRIMARY KEY,
 "requestId" UUID NOT NULL UNIQUE,
 "requestHash" VARCHAR(64) NOT NULL,
 "saleId" INTEGER NOT NULL REFERENCES "Sale"("saleId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userName" VARCHAR(100) NOT NULL,
 "kind" "SaleOperationKind" NOT NULL,
 "amount" DECIMAL(18,2) NOT NULL,
 "method" "PaymentMethod",
 "reason" VARCHAR(500) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SaleOperation_amount_check" CHECK (
  ("kind" IN ('PAYMENT', 'REFUND') AND "amount" > 0 AND "method" IS NOT NULL)
  OR ("kind" IN ('RETURN', 'CANCEL') AND "amount" >= 0 AND "method" IS NULL)
 )
);
CREATE INDEX "SaleOperation_saleId_operationId_idx" ON "SaleOperation"("saleId", "operationId");
CREATE TABLE "SaleOperationItem" (
 "operationItemId" SERIAL PRIMARY KEY,
 "operationId" INTEGER NOT NULL REFERENCES "SaleOperation"("operationId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "saleItemId" INTEGER NOT NULL REFERENCES "SaleItem"("saleItemId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
 "subtotal" DECIMAL(18,2) NOT NULL CHECK ("subtotal" >= 0),
 UNIQUE ("operationId", "saleItemId")
);
ALTER TABLE "StockMovement" ADD COLUMN "operationItemId" INTEGER;
CREATE UNIQUE INDEX "StockMovement_operationItemId_key" ON "StockMovement"("operationItemId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_operationItemId_fkey" FOREIGN KEY ("operationItemId") REFERENCES "SaleOperationItem"("operationItemId") ON DELETE RESTRICT ON UPDATE CASCADE;
