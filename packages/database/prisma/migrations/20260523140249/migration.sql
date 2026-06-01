-- AlterEnum
ALTER TYPE "AnalysisStatus" ADD VALUE 'SKIPPED';

-- DropIndex
DROP INDEX "Event_branches_idx";
