-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WECOM';
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WECHAT';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "webhookError" TEXT,
ADD COLUMN     "webhookStatus" TEXT;

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Event_repositoryId_seq_idx" ON "Event"("repositoryId", "seq");
