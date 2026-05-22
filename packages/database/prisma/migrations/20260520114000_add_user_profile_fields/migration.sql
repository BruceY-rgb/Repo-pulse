ALTER TABLE "User"
ADD COLUMN "username" TEXT,
ADD COLUMN "company" TEXT,
ADD COLUMN "bio" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
