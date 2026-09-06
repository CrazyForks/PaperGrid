-- Keep revoked sessions invalid even when an account's previous role is restored.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
