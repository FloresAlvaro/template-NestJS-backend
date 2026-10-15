
-- Audit image replacement using metadata, never the binary content.
CREATE FUNCTION record_product_image_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; current_data jsonb; actor jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.content IS NOT DISTINCT FROM NEW.content THEN RETURN NULL; END IF;
 IF TG_OP <> 'INSERT' THEN previous:=jsonb_build_object('hasImage',true,'sizeBytes',octet_length(OLD.content),'contentFingerprint',md5(encode(OLD.content,'hex'))); END IF;
 IF TG_OP <> 'DELETE' THEN current_data:=jsonb_build_object('hasImage',true,'sizeBytes',octet_length(NEW.content),'contentFingerprint',md5(encode(NEW.content,'hex'))); END IF;
 actor:=NULLIF(current_setting('app.audit_actor',true),'')::jsonb;
 INSERT INTO "AuditLog" ("actorId","actorName",entity,"entityId",action,"before","after")
 VALUES ((actor->>'userId')::integer,COALESCE(actor->>'name','Proceso del sistema'),'ProductImage',COALESCE(NEW."productId",OLD."productId"),TG_OP,previous,current_data);
 RETURN NULL;
END $$;
CREATE TRIGGER product_image_audit AFTER INSERT OR UPDATE OR DELETE ON "ProductImage" FOR EACH ROW EXECUTE FUNCTION record_product_image_audit();
