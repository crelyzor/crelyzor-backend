import prisma from "../db/prismaClient";

class UserDeletionService {
  async hardDeleteExpiredUsers(
    daysThreshold: number,
  ): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    const result = await prisma.user.deleteMany({
      where: {
        deletedAt: {
          not: null,
          lte: cutoffDate,
        },
      },
    });

    return { deletedCount: result.count };
  }
}

export const userDeletionService = new UserDeletionService();
