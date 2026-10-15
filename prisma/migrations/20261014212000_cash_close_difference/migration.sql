-- CHECK expressions accept SQL NULL; require the closing difference explicitly.
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closed_difference_required" CHECK ("closedAt" IS NULL OR "difference" IS NOT NULL);
