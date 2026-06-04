-- Drop isTeamCard flag — replaced by unique constraint (one card per member per team)
ALTER TABLE "Card" DROP COLUMN "isTeamCard";

-- Enforce one card per member per team. PostgreSQL treats NULL as distinct in unique
-- indexes, so personal cards (teamId = NULL) remain unlimited per user.
CREATE UNIQUE INDEX "Card_userId_teamId_key" ON "Card"("userId", "teamId");
