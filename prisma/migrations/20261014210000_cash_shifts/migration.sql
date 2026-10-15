-- CreateEnum
CREATE TYPE "CashMovementKind" AS ENUM ('CASH_IN', 'CASH_OUT', 'PAYMENT', 'REFUND');

-- CreateTable
CREATE TABLE "CashRegister" (
    "registerId" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("registerId")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "shiftId" SERIAL NOT NULL,
    "registerId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "userName" VARCHAR(100) NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "openingAmount" DECIMAL(18,2) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closeRequestId" UUID,
    "closeHash" VARCHAR(64),
    "countedAmount" DECIMAL(18,2),
    "expectedAmount" DECIMAL(18,2),
    "difference" DECIMAL(18,2),
    "closeReason" VARCHAR(500),

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("shiftId")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "movementId" SERIAL NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "userName" VARCHAR(100) NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "kind" "CashMovementKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleOperationId" INTEGER,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("movementId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_name_key" ON "CashRegister"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CashShift_requestId_key" ON "CashShift"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CashShift_closeRequestId_key" ON "CashShift"("closeRequestId");

-- CreateIndex
CREATE INDEX "CashShift_userId_shiftId_idx" ON "CashShift"("userId", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_requestId_key" ON "CashMovement"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_saleOperationId_key" ON "CashMovement"("saleOperationId");

-- CreateIndex
CREATE INDEX "CashMovement_shiftId_movementId_idx" ON "CashMovement"("shiftId", "movementId");

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("registerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("shiftId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_saleOperationId_fkey" FOREIGN KEY ("saleOperationId") REFERENCES "SaleOperation"("operationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A register and cashier can each have only one active shift.
CREATE UNIQUE INDEX "CashShift_open_register_key" ON "CashShift" ("registerId") WHERE "closedAt" IS NULL;
CREATE UNIQUE INDEX "CashShift_open_user_key" ON "CashShift" ("userId") WHERE "closedAt" IS NULL;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_amounts_check" CHECK ("openingAmount" >= 0 AND ("countedAmount" IS NULL OR "countedAmount" >= 0) AND ("expectedAmount" IS NULL OR "expectedAmount" >= 0));
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closed_check" CHECK (
 ("closedAt" IS NULL AND "closeRequestId" IS NULL AND "closeHash" IS NULL AND "countedAmount" IS NULL AND "expectedAmount" IS NULL AND "difference" IS NULL AND "closeReason" IS NULL) OR
 ("closedAt" IS NOT NULL AND "closeRequestId" IS NOT NULL AND "closeHash" IS NOT NULL AND "countedAmount" IS NOT NULL AND "expectedAmount" IS NOT NULL AND "difference" = "countedAmount"-"expectedAmount" AND "closeReason" IS NOT NULL));
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_amount_check" CHECK (amount > 0);
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_source_check" CHECK ((kind IN ('CASH_IN','CASH_OUT') AND method='CASH' AND "saleOperationId" IS NULL) OR (kind IN ('PAYMENT','REFUND') AND "saleOperationId" IS NOT NULL));
INSERT INTO "CashRegister" (name) VALUES ('Caja principal');
