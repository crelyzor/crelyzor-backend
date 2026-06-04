-- Slug uniqueness was global per user. Now scoped to personal cards only.
-- Team cards skip slug uniqueness — the @@unique([userId, teamId]) constraint
-- already ensures one card per member per team, so slug collisions are impossible.
DROP INDEX IF EXISTS "Card_userId_slug_key";
CREATE UNIQUE INDEX "Card_userId_slug_key" ON "Card"("userId", "slug") WHERE "teamId" IS NULL;
