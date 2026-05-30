-- Phase 6 P5.3 backfill — heals AI-extracted Task rows shipped between
-- P5.1.c.ii (encrypt description under meeting principal) and P5.3
-- (write teamId on the row + principalForTask switch). Without this fix,
-- principalForTask on those rows would resolve to user DEK while their
-- description bytes are encrypted under team DEK → silent decrypt failure.
--
-- Idempotent: only updates rows where teamId IS NULL AND meeting.teamId IS
-- NOT NULL. Safe to re-run.
UPDATE "Task"
SET "teamId" = m."teamId"
FROM "Meeting" m
WHERE "Task"."meetingId" = m."id"
  AND "Task"."source" = 'AI_EXTRACTED'
  AND m."teamId" IS NOT NULL
  AND "Task"."teamId" IS NULL
  AND "Task"."description" IS NOT NULL;
