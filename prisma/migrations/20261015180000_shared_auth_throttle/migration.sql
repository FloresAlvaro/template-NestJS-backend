CREATE TABLE "AuthRateLimit" (
  "key" VARCHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 11),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
