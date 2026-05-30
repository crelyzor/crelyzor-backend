-- Phase 6 P5.8 — UserUsage scope split.
--
-- Drops the actor-only uniqueness so each user can have multiple ledger
-- rows: one personal row plus one row per team they own. Two partial
-- unique indexes replace the column-level @unique:
--   UserUsage_user_personal_unique: (userId) WHERE teamId IS NULL
--   UserUsage_user_team_unique:     (userId, teamId) WHERE teamId IS NOT NULL
--
-- Backfill: existing rows all have teamId=null (the column existed since
-- Phase 6 P0 but no caller has set it). They become the "personal" row
-- for each user — strictly covered by the personal partial unique.

-- 1. Drop the legacy unique constraint (idempotent guard).
DROP INDEX IF EXISTS "UserUsage_userId_key";

-- 2. Composite query index for scoped lookups.
CREATE INDEX IF NOT EXISTS "UserUsage_userId_teamId_idx"
  ON "UserUsage"("userId", "teamId");

-- 3. Partial unique indexes — one per scope.
CREATE UNIQUE INDEX "UserUsage_user_personal_unique"
  ON "UserUsage" ("userId")
  WHERE "teamId" IS NULL;

CREATE UNIQUE INDEX "UserUsage_user_team_unique"
  ON "UserUsage" ("userId", "teamId")
  WHERE "teamId" IS NOT NULL;
