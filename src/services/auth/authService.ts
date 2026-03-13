import { LoginMethod, ProviderEnum } from "@prisma/client";
import type { User } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { tokenService } from "./tokenService";
import { sessionService } from "./sessionService";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import { logger } from "../../utils/logging/logger";
import {
  UserResponse,
  RefreshTokenRequest,
  LogoutRequest,
} from "../../types/authTypes";

class AuthService {
  async refreshToken(
    data: RefreshTokenRequest,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const result = await sessionService.refreshTokens(
      data.refreshToken,
      ipAddress,
    );
    return result;
  }

  async logout(
    userId: string,
    data?: LogoutRequest,
    currentSessionId?: string,
  ): Promise<{ message: string }> {
    if (data?.logoutAll) {
      await sessionService.revokeAllSessions(userId);
      return { message: "Logged out from all devices successfully" };
    } else if (data?.refreshToken) {
      try {
        const refreshTokenPayload = tokenService.verifyRefreshToken(
          data.refreshToken,
        );
        await sessionService.revokeSession(
          userId,
          refreshTokenPayload.sessionId,
        );
      } catch (error) {
        // refresh token invalid or already expired — logout proceeds silently
      }
      return { message: "Logged out successfully" };
    } else if (currentSessionId) {
      await sessionService.revokeSession(userId, currentSessionId);
      return { message: "Logged out successfully" };
    }

    return { message: "Logged out successfully" };
  }

  async getUserProfile(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    return this.mapUserToResponse(user);
  }

  async updateUserProfile(
    userId: string,
    updateData: Partial<{
      name: string;
      countryCode: string;
      phoneNumber: string;
      country: string;
      state: string;
      avatarUrl: string;
    }>,
  ): Promise<UserResponse> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    return this.mapUserToResponse(user);
  }

  async getUserSessions(userId: string, currentSessionId?: string) {
    return await sessionService.getUserSessions(userId, currentSessionId);
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string }> {
    await sessionService.revokeSession(userId, sessionId);
    return { message: "Session revoked successfully" };
  }

  async validateUserAccess(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, deletedAt: true },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    if (!user.isActive || user.deletedAt !== null) {
      throw ErrorFactory.unauthorized(
        "Account is inactive or has been deleted",
      );
    }

    return true;
  }

  async deactivateAccount(userId: string): Promise<{ message: string }> {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      await tx.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      });

      await tx.session.deleteMany({
        where: { userId },
      });
    });

    return { message: "Account deactivated successfully" };
  }

  private mapUserToResponse(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified,
      name: user.name,
      avatarUrl: user.avatarUrl,
      countryCode: user.countryCode || undefined,
      phoneNumber: user.phoneNumber || undefined,
      country: user.country || undefined,
      state: user.state || undefined,
      lastLoginAt: user.lastLoginAt || undefined,
      isActive: user.isActive,
    };
  }

  async generateTokens(
    user: User,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: "Bearer";
    user: UserResponse;
  }> {
    const { sessionId, refreshToken } = await sessionService.createSession(
      user.id,
      deviceInfo,
      ipAddress,
    );

    const accessToken = await tokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      sessionId,
    });

    await this.logLoginHistory(
      user.id,
      true,
      LoginMethod.OAUTH,
      ipAddress,
      deviceInfo,
      ProviderEnum.GOOGLE,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      tokenType: "Bearer",
      user: this.mapUserToResponse(user),
    };
  }

  async logLoginHistory(
    userId: string,
    success: boolean,
    loginMethod: LoginMethod,
    ipAddress?: string,
    deviceInfo?: string,
    provider?: ProviderEnum | null,
    failureReason?: string,
  ) {
    try {
      await prisma.loginHistory.create({
        data: {
          userId,
          ipAddress: ipAddress || "Unknown",
          deviceInfo: deviceInfo || "Unknown",
          success,
          loginMethod,
          provider: provider || null,
          failureReason,
        },
      });
    } catch (error) {
      logger.error("Failed to log login history", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const authService = new AuthService();
