/**
 * Phase 6+ — On-demand team DEK rotation.
 *
 * Generates a fresh DEK for a team, stores it as the new current version,
 * and archives the old wrapped DEK in TeamDekHistory so that existing
 * ciphertexts (which carry a version byte) remain decryptable. No re-encryption
 * of existing records is required — decrypt() reads the version byte and fetches
 * the matching DEK from history automatically.
 *
 * MUST be called by an admin (enforced at the route layer).
 */
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { generateAndWrapDek, prismaBytes } from "../../utils/security/crypto";
import { evictDek } from "../../utils/security/dekCache";
import { logger } from "../../utils/logging/logger";

export interface RotationResult {
  id: string;
  previousVersion: number;
  newVersion: number;
}

export async function rotateTeamDek(teamId: string): Promise<RotationResult> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, isDeleted: false },
    select: { id: true, dekVersion: true },
  });
  if (!team) throw new AppError("Team not found", 404);

  // KMS call outside the transaction — avoids holding a DB connection during
  // the network round-trip. If KMS fails here nothing is written.
  const { rawDek, wrappedDek } = await generateAndWrapDek();
  rawDek.fill(0); // zero immediately — we only persist the wrapped form

  const previousVersion = team.dekVersion;
  const newVersion = previousVersion + 1;

  await prisma.$transaction(
    async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: {
          wrappedDek: prismaBytes(wrappedDek),
          dekVersion: newVersion,
        },
      });
      await tx.teamDekHistory.create({
        data: {
          teamId,
          version: newVersion,
          wrappedDek: prismaBytes(wrappedDek),
        },
      });
    },
    { timeout: 15000 },
  );

  // Evict all cached DEKs for this team so the next read fetches the new version.
  evictDek({ type: "team", id: teamId });

  logger.info("team.dek.rotated", { teamId, previousVersion, newVersion });

  return { id: teamId, previousVersion, newVersion };
}

export async function rotateUserDek(userId: string): Promise<RotationResult> {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    select: { id: true, dekVersion: true },
  });
  if (!user) throw new AppError("User not found", 404);
  if (user.dekVersion === null || user.dekVersion === undefined) {
    throw new AppError("User has no DEK to rotate", 400);
  }

  const { rawDek, wrappedDek } = await generateAndWrapDek();
  rawDek.fill(0);

  const previousVersion = user.dekVersion;
  const newVersion = previousVersion + 1;

  await prisma.$transaction(
    async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          wrappedDek: prismaBytes(wrappedDek),
          dekVersion: newVersion,
        },
      });
      await tx.userDekHistory.create({
        data: {
          userId,
          version: newVersion,
          wrappedDek: prismaBytes(wrappedDek),
        },
      });
    },
    { timeout: 15000 },
  );

  evictDek({ type: "user", id: userId });
  logger.info("user.dek.rotated", { userId, previousVersion, newVersion });
  return { id: userId, previousVersion, newVersion };
}

export async function cryptoShredUserData(userId: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new AppError("User not found", 404);

  await prisma.$transaction(
    async (tx) => {
      await tx.userDekHistory.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: { wrappedDek: null },
      });
    },
    { timeout: 15000 },
  );

  evictDek({ type: "user", id: userId });
  logger.info("user.data.crypto_shredded", { userId });
}
