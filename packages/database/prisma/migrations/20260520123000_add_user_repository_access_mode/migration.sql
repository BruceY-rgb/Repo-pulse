CREATE TYPE "RepositoryAccessMode" AS ENUM ('EDITABLE', 'MONITOR');

ALTER TABLE "UserRepository"
ADD COLUMN "accessMode" "RepositoryAccessMode" NOT NULL DEFAULT 'EDITABLE';
