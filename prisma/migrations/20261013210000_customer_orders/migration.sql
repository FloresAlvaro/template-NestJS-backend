CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "OrderOperationKind" AS ENUM ('CONFIRM', 'READY', 'COMPLETE', 'CANCEL');

CREATE TABLE "Order" (
  "orderId" SERIAL PRIMARY KEY,
  "requestId" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "customerId" INTEGER NOT NULL REFERENCES "Customer"("customerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "customerName" VARCHAR(100) NOT NULL,
  "customerDocument" VARCHAR(50),
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "total" DECIMAL(18,2) NOT NULL CHECK ("total" >= 0),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "saleId" INTEGER REFERENCES "Sale"("saleId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_status_sale_check" CHECK (
    ("status" IN ('CONFIRMED', 'READY', 'COMPLETED') AND "saleId" IS NOT NULL)
    OR ("status" IN ('PENDING', 'EXPIRED') AND "saleId" IS NULL)
    OR "status" = 'CANCELLED'
  )
);
CREATE UNIQUE INDEX "Order_requestId_key" ON "Order"("requestId");
CREATE UNIQUE INDEX "Order_saleId_key" ON "Order"("saleId");
CREATE INDEX "Order_userId_orderId_idx" ON "Order"("userId", "orderId");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

CREATE TABLE "OrderItem" (
  "orderItemId" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"("productId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productName" VARCHAR(150) NOT NULL,
  "sku" VARCHAR(64) NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "unitPrice" DECIMAL(18,2) NOT NULL CHECK ("unitPrice" >= 0),
  "subtotal" DECIMAL(18,2) NOT NULL CHECK ("subtotal" = "unitPrice" * "quantity")
);
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");
CREATE INDEX "OrderItem_productId_orderId_idx" ON "OrderItem"("productId", "orderId");

CREATE TABLE "OrderOperation" (
  "operationId" SERIAL PRIMARY KEY,
  "requestId" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "orderId" INTEGER NOT NULL REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userName" VARCHAR(100) NOT NULL,
  "kind" "OrderOperationKind" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OrderOperation_requestId_key" ON "OrderOperation"("requestId");
CREATE INDEX "OrderOperation_orderId_operationId_idx" ON "OrderOperation"("orderId", "operationId");
CREATE INDEX "OrderOperation_userId_idx" ON "OrderOperation"("userId");
