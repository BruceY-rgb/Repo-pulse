-- CreateTable
CREATE TABLE "UserRepositoryConversationState" (
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRepositoryConversationState_pkey" PRIMARY KEY ("userId","repositoryId")
);

-- CreateIndex
CREATE INDEX "UserRepositoryConversationState_userId_lastReadAt_idx" ON "UserRepositoryConversationState"("userId", "lastReadAt");

-- CreateIndex
CREATE INDEX "UserRepositoryConversationState_repositoryId_updatedAt_idx" ON "UserRepositoryConversationState"("repositoryId", "updatedAt");

-- AddForeignKey
ALTER TABLE "UserRepositoryConversationState" ADD CONSTRAINT "UserRepositoryConversationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRepositoryConversationState" ADD CONSTRAINT "UserRepositoryConversationState_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
