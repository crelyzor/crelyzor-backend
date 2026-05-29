import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { encrypt, decrypt, type Principal } from "../../utils/security/crypto";
import { logger } from "../../utils/logging/logger";
import { principalForMeeting } from "../meetings/meetingService";

/**
 * Get-or-create the single conversation record for a (user, meeting) pair.
 * Uses Prisma's upsert on the @@unique([meetingId, userId]) constraint.
 */
export const getOrCreateConversation = async (
  userId: string,
  meetingId: string,
): Promise<string> => {
  const conversation = await prisma.askAIConversation.upsert({
    where: { meetingId_userId: { meetingId, userId } },
    create: { userId, meetingId },
    update: {},
    select: { id: true },
  });
  return conversation.id;
};

/**
 * Return all messages for a conversation ordered oldest → newest.
 *
 * Phase 6 P5.1.c.ii — decryption principal is derived from the parent
 * meeting (team DEK on team meetings, user DEK otherwise) so any team
 * admin reading another admin's Ask AI history decrypts cleanly.
 */
export const getMessages = async (
  userId: string,
  meetingId: string,
): Promise<{ role: string; content: string; createdAt: Date }[]> => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, isDeleted: false },
    select: { teamId: true, createdById: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);
  const meetingPrincipal = principalForMeeting(meeting);

  const conversation = await prisma.askAIConversation.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    select: {
      messages: {
        orderBy: { createdAt: "desc" },
        select: { role: true, content: true, createdAt: true },
        take: 6,
      },
    },
  });
  if (!conversation) return [];

  const messages = await Promise.all(
    // Reverse to restore oldest-first order (query fetches newest-first to get last 6)
    [...conversation.messages].reverse().map(async (m) => ({
      role: m.role,
      // Pre-Phase-5 rows were stored as plaintext cast to BYTEA — fail gracefully
      content: await decrypt(m.content, meetingPrincipal).catch((err) => {
        logger.warn("Failed to decrypt AskAI message content", {
          error: err instanceof Error ? err.message : String(err),
        });
        return "";
      }),
      createdAt: m.createdAt,
    })),
  );
  return messages;
};

/**
 * Append a single message (user or assistant) to the conversation.
 *
 * Phase 6 P5.1.c.ii — caller passes the `Principal` derived from the
 * parent meeting (via `principalForMeeting(meeting)`) so messages are
 * encrypted under the team DEK on team meetings. Eliminates the need to
 * re-fetch the meeting for every append.
 */
export const appendMessage = async (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  principal: Principal,
): Promise<void> => {
  const encrypted = await encrypt(content, principal);
  await prisma.askAIMessage.create({
    data: { conversationId, role, content: encrypted },
  });
};

/**
 * Delete all messages in the conversation (keeps the conversation row).
 */
export const clearMessages = async (
  userId: string,
  meetingId: string,
): Promise<void> => {
  const conversation = await prisma.askAIConversation.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    select: { id: true },
  });
  if (!conversation) return;
  await prisma.askAIMessage.deleteMany({
    where: { conversationId: conversation.id },
  });
};
