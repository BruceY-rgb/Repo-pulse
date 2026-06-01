-- Runtime configuration for webhook public URLs and future app-level settings.
CREATE TABLE IF NOT EXISTS "AppConfig" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- Persist webhook health so the UI can distinguish missing hooks, permission
-- failures, and working hooks after reloads.
ALTER TABLE "Repository"
  ADD COLUMN IF NOT EXISTS "webhookStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "webhookError" TEXT;

-- Monotonic event sequence for WebSocket reconnect replay.
CREATE SEQUENCE IF NOT EXISTS "Event_seq_seq";

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "seq" BIGINT;

UPDATE "Event"
SET "seq" = nextval('"Event_seq_seq"')
WHERE "seq" IS NULL;

SELECT setval(
  '"Event_seq_seq"',
  GREATEST(COALESCE((SELECT MAX("seq") FROM "Event"), 0), 1),
  true
);

ALTER TABLE "Event"
  ALTER COLUMN "seq" SET NOT NULL,
  ALTER COLUMN "seq" SET DEFAULT nextval('"Event_seq_seq"');

ALTER SEQUENCE "Event_seq_seq" OWNED BY "Event"."seq";

CREATE INDEX IF NOT EXISTS "Event_repositoryId_seq_idx" ON "Event"("repositoryId", "seq");
