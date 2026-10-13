CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT');
CREATE TABLE "Inventory" (
  "productId" INTEGER PRIMARY KEY,
  "quantity" INTEGER NOT NULL DEFAULT 0 CHECK ("quantity" >= 0),
  "minStock" INTEGER NOT NULL DEFAULT 0 CHECK ("minStock" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("productId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Inventory" ("productId") SELECT "productId" FROM "Product";
CREATE TABLE "StockMovement" (
  "stockMovementId" SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "type" "StockMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" <> 0),
  "previousQuantity" INTEGER NOT NULL CHECK ("previousQuantity" >= 0),
  "resultingQuantity" INTEGER NOT NULL CHECK ("resultingQuantity" >= 0),
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_balance_check" CHECK ("resultingQuantity"::bigint = "previousQuantity"::bigint + "quantity"::bigint),
  CONSTRAINT "StockMovement_direction_check" CHECK (("type" = 'ENTRY' AND "quantity" > 0) OR ("type" = 'EXIT' AND "quantity" < 0) OR "type" = 'ADJUSTMENT')
);
CREATE INDEX "StockMovement_productId_stockMovementId_idx" ON "StockMovement"("productId", "stockMovementId");
