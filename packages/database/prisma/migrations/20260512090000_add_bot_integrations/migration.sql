-- CreateEnum
CREATE TYPE "BotPlatform" AS ENUM ('FEISHU', 'DINGTALK', 'WECHAT');

-- CreateEnum
CREATE TYPE "BotActionType" AS ENUM ('VIEW_DETAILS', 'SUGGEST_FIX', 'COMMENT_PR', 'APPROVE_PR', 'REQUEST_CHANGES', 'MERGE_PR', 'CLOSE_PR');

-- CreateEnum
CREATE TYPE "BotActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WECHAT';

-- CreateTable
CREATE TABLE "BotIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "BotPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "credentialsEncrypted" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "defaultRepositoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotConversation" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "BotPlatform" NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "externalUserId" TEXT,
    "repositoryId" TEXT,
    "lastEventId" TEXT,
    "state" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotActionRun" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "repositoryId" TEXT,
    "actionType" "BotActionType" NOT NULL,
    "status" "BotActionStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotActionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BotIntegrationRepositories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BotIntegration_userId_platform_key" ON "BotIntegration"("userId", "platform");

-- CreateIndex
CREATE INDEX "BotIntegration_enabled_idx" ON "BotIntegration"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "BotConversation_integrationId_externalChatId_key" ON "BotConversation"("integrationId", "externalChatId");

-- CreateIndex
CREATE INDEX "BotConversation_userId_platform_idx" ON "BotConversation"("userId", "platform");

-- CreateIndex
CREATE INDEX "BotActionRun_userId_createdAt_idx" ON "BotActionRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BotActionRun_eventId_idx" ON "BotActionRun"("eventId");

-- CreateIndex
CREATE INDEX "BotActionRun_status_idx" ON "BotActionRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "_BotIntegrationRepositories_AB_unique" ON "_BotIntegrationRepositories"("A", "B");

-- CreateIndex
CREATE INDEX "_BotIntegrationRepositories_B_index" ON "_BotIntegrationRepositories"("B");

-- AddForeignKey
ALTER TABLE "BotIntegration" ADD CONSTRAINT "BotIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConversation" ADD CONSTRAINT "BotConversation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "BotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConversation" ADD CONSTRAINT "BotConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotActionRun" ADD CONSTRAINT "BotActionRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "BotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotActionRun" ADD CONSTRAINT "BotActionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BotIntegrationRepositories" ADD CONSTRAINT "_BotIntegrationRepositories_A_fkey" FOREIGN KEY ("A") REFERENCES "BotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BotIntegrationRepositories" ADD CONSTRAINT "_BotIntegrationRepositories_B_fkey" FOREIGN KEY ("B") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
