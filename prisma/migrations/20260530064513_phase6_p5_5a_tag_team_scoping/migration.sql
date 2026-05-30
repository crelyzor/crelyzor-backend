-- Phase 6 P5.5.a — Tag team-scoping.
-- Adds Tag.teamId (FK to Team, SetNull on delete) + replaces the actor-only
-- @@unique([userId, name]) with two partial unique indexes that let
-- personal "Important" and team "Important" co-exist while still preventing
-- duplicates within each scope.

-- 1. Column + FK
ALTER TABLE "Tag" ADD COLUMN "teamId" UUID;

ALTER TABLE "Tag"
  ADD CONSTRAINT "Tag_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Index supporting team-scoped Tag queries.
CREATE INDEX "Tag_teamId_isDeleted_idx" ON "Tag"("teamId", "isDeleted");

-- 3. Drop the legacy actor-only uniqueness — replaced by partial indexes below.
--    Idempotent guard in case the index name differs across environments.
DROP INDEX IF EXISTS "Tag_userId_name_key";

-- 4. Partial unique indexes — one per scope. WHERE isDeleted = false lets
--    a soft-deleted tag name be reused immediately (matches the rest of the
--    codebase's restore-after-delete semantics).
CREATE UNIQUE INDEX "Tag_user_personal_unique"
  ON "Tag" ("userId", "name")
  WHERE "teamId" IS NULL AND "isDeleted" = false;

CREATE UNIQUE INDEX "Tag_team_unique"
  ON "Tag" ("teamId", "name")
  WHERE "teamId" IS NOT NULL AND "isDeleted" = false;
