import { v7 as uuidv7 } from "uuid";
import { tokenService } from "./tokenService";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import { SessionInfo } from "../../types/authTypes";
import prisma from "../../db/prismaClient";
class SessionService {
  async createSession(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
    refreshTokenJti: string;
  }> {
    const sessionId = uuidv7();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        deviceInfo: deviceInfo || "Unknown Device",
        ipAddress: ipAddress || "Unknown IP",
        expiredAt: expiresAt,
        lastAccessedAt: new Date(),
      },
    });

    const refreshToken = tokenService.generateRefreshToken(userId, sessionId);
    const refreshTokenPayload = tokenService.verifyRefreshToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        id: refreshTokenPayload.jti,
        userId,
        token: refreshToken,
        expiresAt,
        deviceInfo: deviceInfo || "Unknown Device",
        ipAddress: ipAddress || "Unknown IP",
      },
    });

    return {
      sessionId,
      refreshToken,
      refreshTokenJti: refreshTokenPayload.jti,
    };
  }

  async refreshTokens(
    refreshTokenString: string,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const refreshTokenPayload =
      tokenService.verifyRefreshToken(refreshTokenString);

    const storedRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        id: refreshTokenPayload.jti,
        userId: refreshTokenPayload.userId,
        revoked: false,
      },
      include: {
        user: true,
      },
    });

    if (!storedRefreshToken) {
      throw ErrorFactory.unauthorized("Invalid or revoked refresh token");
    }

    if (storedRefreshToken.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: refreshTokenPayload.jti },
        data: { revoked: true },
      });
      throw ErrorFactory.unauthorized("Refresh token expired");
    }

    if (!storedRefreshToken.user.isActive) {
      throw ErrorFactory.unauthorized("User account is inactive");
    }

    await prisma.refreshToken.update({
      where: { id: refreshTokenPayload.jti },
      data: { revoked: true },
    });

    const { refreshToken: newRefreshToken } = await this.createSession(
      storedRefreshToken.userId,
      storedRefreshToken.deviceInfo,
      ipAddress || storedRefreshToken.ipAddress,
    );

    const accessToken = tokenService.generateAccessToken({
      userId: storedRefreshToken.user.id,
      email: storedRefreshToken.user.email,
      emailVerified: storedRefreshToken.user.emailVerified,
      sessionId: refreshTokenPayload.sessionId,
    });

    await prisma.session.update({
      where: { id: refreshTokenPayload.sessionId },
      data: { lastAccessedAt: new Date() },
    });

    await prisma.user.update({
      where: { id: storedRefreshToken.userId },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600, // 1 hour
    };
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        await tx.refreshToken.updateMany({
          where: {
            userId,
          },
          data: { revoked: true },
        });

        await tx.session.deleteMany({
          where: {
            id: sessionId,
            userId,
          },
        });
      },
      { timeout: 15000 },
    );
  }

  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<void> {
    const whereClause: { userId: string; id?: { not: string } } = { userId };
    if (exceptSessionId) {
      whereClause.id = { not: exceptSessionId };
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.refreshToken.updateMany({
          where: {
            userId,
            revoked: false,
          },
          data: { revoked: true },
        });

        await tx.session.deleteMany({
          where: whereClause,
        });

        await tx.user.update({
          where: { id: userId },
          data: { activeSessionId: exceptSessionId || null },
        });
      },
      { timeout: 15000 },
    );
  }

  async getUserSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionInfo[]> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiredAt: { gt: new Date() },
      },
      orderBy: { lastAccessedAt: "desc" },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceInfo: session.deviceInfo || undefined,
      ipAddress: session.ipAddress || undefined,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastAccessedAt: new Date() },
    });
  }

  async cleanupExpiredSessions(): Promise<{
    sessionsDeleted: number;
    tokensRevoked: number;
  }> {
    const now = new Date();

    const [deletedSessions, revokedTokens] = await prisma.$transaction(
      async (tx) => {
        const sessions = await tx.session.deleteMany({
          where: { expiredAt: { lt: now } },
        });

        const tokens = await tx.refreshToken.updateMany({
          where: {
            expiresAt: { lt: now },
            revoked: false,
          },
          data: { revoked: true },
        });

        return [sessions, tokens];
      },
      { timeout: 15000 },
    );

    return {
      sessionsDeleted: deletedSessions.count,
      tokensRevoked: revokedTokens.count,
    };
  }

  async validateSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        expiredAt: { gt: new Date() },
      },
    });

    return !!session;
  }

  async getSessionDetails(
    sessionId: string,
    userId: string,
  ): Promise<SessionInfo | null> {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      deviceInfo: session.deviceInfo || undefined,
      ipAddress: session.ipAddress || undefined,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      isCurrent: false,
    };
  }

  async isRefreshTokenValid(jti: string): Promise<boolean> {
    const refreshToken = await prisma.refreshToken.findFirst({
      where: {
        id: jti,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    return !!refreshToken;
  }

  async getRefreshTokenDetails(jti: string) {
    return await prisma.refreshToken.findFirst({
      where: { id: jti },
      include: { user: true },
    });
  }

  async revokeRefreshToken(jti: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id: jti },
      data: { revoked: true },
    });
  }
}

export const sessionService = new SessionService();
