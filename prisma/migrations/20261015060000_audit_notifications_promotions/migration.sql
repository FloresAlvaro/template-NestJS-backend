-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountTotal" DECIMAL(18,2),
ADD COLUMN     "grossTotal" DECIMAL(18,2),
ADD COLUMN     "promotionSnapshot" JSONB;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "listUnitPrice" DECIMAL(18,2),
ADD COLUMN     "unitDiscount" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "AuditLog" (
    "auditId" SERIAL NOT NULL,
    "actorId" INTEGER,
    "actorName" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("auditId")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "promotionId" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "percentBps" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowSeller" BOOLEAN NOT NULL DEFAULT false,
    "minSubtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("promotionId")
);

-- CreateTable
CREATE TABLE "OrderNotification" (
    "readAt" TIMESTAMP(3),
    "notificationId" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("notificationId")
);

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_auditId_idx" ON "AuditLog"("entity", "entityId", "auditId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_auditId_idx" ON "AuditLog"("actorId", "auditId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "OrderNotification_deliveredAt_nextAttemptAt_idx" ON "OrderNotification"("deliveredAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OrderNotification_userId_notificationId_idx" ON "OrderNotification"("userId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderNotification_orderId_status_key" ON "OrderNotification"("orderId", "status");

-- AddForeignKey
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Administrative snapshots contain an explicit allowlist. Passwords/tokens/images never enter this table.
CREATE FUNCTION record_administrative_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_data jsonb; new_data jsonb; actor jsonb; record_id integer; fields text[];
BEGIN
 fields := TG_ARGV[1:TG_NARGS-1];
 IF TG_OP <> 'INSERT' THEN
   SELECT jsonb_object_agg(key, CASE WHEN key IN ('cost','salePrice','minSubtotal') THEN to_jsonb(value #>> '{}') ELSE value END)
   INTO old_data FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(fields);
 END IF;
 IF TG_OP <> 'DELETE' THEN
   SELECT jsonb_object_agg(key, CASE WHEN key IN ('cost','salePrice','minSubtotal') THEN to_jsonb(value #>> '{}') ELSE value END)
   INTO new_data FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(fields);
 END IF;
 IF old_data IS NOT DISTINCT FROM new_data THEN RETURN NULL; END IF;
 actor := NULLIF(current_setting('app.audit_actor',true),'')::jsonb;
 record_id := COALESCE((to_jsonb(NEW)->>TG_ARGV[0])::integer,(to_jsonb(OLD)->>TG_ARGV[0])::integer);
 INSERT INTO "AuditLog" ("actorId","actorName",entity,"entityId",action,"before","after")
 VALUES ((actor->>'userId')::integer,COALESCE(actor->>'name','Proceso del sistema'),TG_TABLE_NAME,record_id,TG_OP,old_data,new_data);
 RETURN NULL;
END $$;
CREATE TRIGGER category_audit AFTER INSERT OR UPDATE OR DELETE ON "Category" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('categoryId','name','description','isActive');
CREATE TRIGGER subcategory_audit AFTER INSERT OR UPDATE OR DELETE ON "SubCategory" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('subCategoryId','categoryId','name','description','isActive');
CREATE TRIGGER product_audit AFTER INSERT OR UPDATE OR DELETE ON "Product" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('productId','subCategoryId','name','sku','barcode','description','cost','salePrice','isActive');
CREATE TRIGGER user_audit AFTER INSERT OR UPDATE OR DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('userId','name','email','role','isActive');
CREATE TRIGGER inventory_settings_audit AFTER INSERT OR UPDATE OR DELETE ON "Inventory" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('productId','minStock');
CREATE TRIGGER supplier_audit AFTER INSERT OR UPDATE OR DELETE ON "Supplier" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('supplierId','name','document','contactName','email','phone','address','notes','isActive');
CREATE TRIGGER promotion_audit AFTER INSERT OR UPDATE OR DELETE ON "Promotion" FOR EACH ROW EXECUTE FUNCTION record_administrative_audit('promotionId','code','name','percentBps','startsAt','endsAt','minSubtotal','isActive','allowSeller','version');
CREATE FUNCTION reject_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Administrative audit is append-only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit_changes();
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_rules_check" CHECK ("percentBps" BETWEEN 1 AND 10000 AND "endsAt">"startsAt" AND "minSubtotal">=0 AND version>=1);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_discount_check" CHECK (("grossTotal" IS NULL AND "discountTotal" IS NULL AND "promotionSnapshot" IS NULL) OR ("grossTotal" IS NOT NULL AND "discountTotal" IS NOT NULL AND "grossTotal">=0 AND "discountTotal">=0 AND total="grossTotal"-"discountTotal"));
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_discount_check" CHECK (("listUnitPrice" IS NULL AND "unitDiscount" IS NULL) OR ("listUnitPrice" IS NOT NULL AND "unitDiscount" IS NOT NULL AND "unitDiscount">=0 AND "listUnitPrice">="unitDiscount" AND "unitPrice"="listUnitPrice"-"unitDiscount"));
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_attempts_check" CHECK (attempts>=0);
-- Queue each customer-visible status exactly once in the same transaction as the status change.
CREATE FUNCTION queue_order_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE email text; label text;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('CONFIRMED','READY','CANCELLED','EXPIRED') THEN RETURN NULL; END IF;
 SELECT u.email INTO email FROM "User" u WHERE u."userId"=NEW."userId";
 label := CASE NEW.status WHEN 'CONFIRMED' THEN 'confirmado' WHEN 'READY' THEN 'listo para retirar' WHEN 'CANCELLED' THEN 'cancelado' WHEN 'EXPIRED' THEN 'vencido' END;
 INSERT INTO "OrderNotification" ("orderId","userId",status,recipient,subject,body)
 VALUES (NEW."orderId",NEW."userId",NEW.status,email,format('Pedido #%s: %s',NEW."orderId",label),format('Tu pedido #%s está %s. Consulta el detalle en Tienda, en Mis pedidos.',NEW."orderId",label))
 ON CONFLICT ("orderId",status) DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER order_status_notification AFTER UPDATE OF status ON "Order" FOR EACH ROW EXECUTE FUNCTION queue_order_notification();
