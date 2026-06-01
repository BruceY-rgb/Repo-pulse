CREATE TYPE "RepositoryAccessLevel" AS ENUM (
  'OWNER',
  'ADMIN',
  'MAINTAIN',
  'WRITE',
  'TRIAGE',
  'READ',
  'NONE'
);

ALTER TABLE "User"
ADD COLUMN "githubLogin" TEXT;

ALTER TABLE "UserRepository"
ADD COLUMN "accessLevel" "RepositoryAccessLevel" NOT NULL DEFAULT 'READ';

UPDATE "UserRepository"
SET "accessLevel" = CASE
  WHEN "accessMode" = 'EDITABLE' THEN 'WRITE'::"RepositoryAccessLevel"
  ELSE 'READ'::"RepositoryAccessLevel"
END;
