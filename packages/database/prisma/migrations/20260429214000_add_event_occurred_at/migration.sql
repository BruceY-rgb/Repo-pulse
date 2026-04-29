-- Add a distinct business timestamp for repository events.
ALTER TABLE "Event"
ADD COLUMN "occurredAt" TIMESTAMP(3);

CREATE INDEX "Event_repositoryId_occurredAt_idx" ON "Event"("repositoryId", "occurredAt");
CREATE INDEX "Event_type_occurredAt_idx" ON "Event"("type", "occurredAt");
