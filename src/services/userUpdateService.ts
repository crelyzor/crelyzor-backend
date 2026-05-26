import { UpdateUserProfileInput } from "../validators/userUpdateSchema";
import { UserProfileResponse } from "../types/userUpdateServiceTypes";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";

export interface UserSearchResult {
  id: string;
  name: string;
  avatarUrl: string | null;
  username: string | null;
}

export const userService = {
  searchUsers: async (
    query: string,
    excludeUserId: string,
    limit = 10,
  ): Promise<UserSearchResult[]> => {
    const q = query.trim();
    if (!q) return [];

    return prisma.user.findMany({
      where: {
        AND: [
          { id: { not: excludeUserId } },
          { isActive: true },
          { isDeleted: false },
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        username: true,
      },
      take: limit,
      orderBy: { name: "asc" },
    });
  },

  updateUserProfile: async (
    userId: string,
    updateData: UpdateUserProfileInput,
  ): Promise<UserProfileResponse> => {
    const existingUser = await prisma.user.findFirst({
      where: { id: userId, isActive: true, isDeleted: false },
      select: { id: true },
    });

    if (!existingUser) {
      throw new AppError("User not found or inactive", 404);
    }
    const updatedUser = await prisma.user.update({
      where: { id: userId, isActive: true, isDeleted: false },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        countryCode: true,
        phoneNumber: true,
        country: true,
        state: true,
        updatedAt: true,
      },
    });
    return updatedUser;
  },
};
