import prisma from "../../db/prismaClient";

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
 */
export const getMessages = async (
  userId: string,
  meetingId: string,
): Promise<{ role: string; content: string; createdAt: Date }[]> => {
  const conversation = await prisma.askAIConversation.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    select: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true, createdAt: true },
      },
    },
  });
  return conversation?.messages ?? [];
};

/**
 * Append a single message (user or assistant) to the conversation.
 */
export const appendMessage = async (
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> => {
  await prisma.askAIMessage.create({
    data: { conversationId, role, content },
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
