import { UpdateUserProfileInput } from "../validators/userUpdateSchema";
import { UserProfileResponse } from "../types/userUpdateServiceTypes";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";

export const userService = {
  updateUserProfile: async (
    userId: string,
    updateData: UpdateUserProfileInput,
  ): Promise<UserProfileResponse> => {
    const existingUser = await prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true },
    });

    if (!existingUser) {
      throw new AppError("User not found or inactive", 404);
    }
    const updatedUser = await prisma.user.update({
      where: { id: userId, isActive: true },
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
