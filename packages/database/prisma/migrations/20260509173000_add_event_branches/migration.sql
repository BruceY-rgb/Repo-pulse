ALTER TABLE "Event" ADD COLUMN "branches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Event"
SET "branches" = ARRAY(
  SELECT DISTINCT branch_value
  FROM unnest(ARRAY["branch", "sourceBranch", "targetBranch"]) AS value(branch_value)
  WHERE branch_value IS NOT NULL AND btrim(branch_value) <> ''
)
WHERE cardinality("branches") = 0;

CREATE INDEX "Event_branches_idx" ON "Event" USING GIN ("branches");
