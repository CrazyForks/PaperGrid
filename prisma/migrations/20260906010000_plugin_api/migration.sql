ALTER TABLE "MediaFile" ADD COLUMN "uploadedByApiKeyId" TEXT REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MediaFile_uploadedByApiKeyId_idx" ON "MediaFile"("uploadedByApiKeyId");

CREATE TABLE "ApiIdempotency" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "apiKeyId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "ApiIdempotency_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ApiIdempotency_apiKeyId_operation_keyHash_key" ON "ApiIdempotency"("apiKeyId", "operation", "keyHash");
CREATE INDEX "ApiIdempotency_expiresAt_idx" ON "ApiIdempotency"("expiresAt");
