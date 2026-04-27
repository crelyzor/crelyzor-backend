import jwt from "jsonwebtoken";
import { v7 as uuidv7 } from "uuid";
import {
  TokenPayload,
  RefreshTokenPayload,
  AuthenticatedUser,
} from "../../types/authTypes";
import { ErrorFactory } from "../../utils/globalErrorHandler";

class TokenService {
  private readonly ACCESS_TOKEN_SECRET: string;
  private readonly REFRESH_TOKEN_SECRET: string;
  private readonly ACCESS_TOKEN_EXPIRY = "1h";
  private readonly REFRESH_TOKEN_EXPIRY = "7d";

  constructor() {
    this.ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || "";
    this.REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || "";

    if (!this.ACCESS_TOKEN_SECRET || !this.REFRESH_TOKEN_SECRET) {
      throw new Error("JWT secrets are not configured");
    }
  }

  generateAccessToken(
    payload: Omit<TokenPayload, "jti" | "iat" | "exp">,
  ): string {
    const jti = uuidv7();
    const tokenPayload: TokenPayload = {
      ...payload,
      jti,
    };

    return jwt.sign(tokenPayload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });
  }

  generateRefreshToken(userId: string, sessionId: string): string {
    const jti = uuidv7();
    const payload: RefreshTokenPayload = {
      userId,
      jti,
      sessionId,
    };

    return jwt.sign(payload, this.REFRESH_TOKEN_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(
        token,
        this.ACCESS_TOKEN_SECRET,
      ) as AuthenticatedUser;

      if (
        !decoded.userId ||
        !decoded.email ||
        !decoded.jti ||
        !decoded.sessionId
      ) {
        throw ErrorFactory.unauthorized("Invalid token payload structure");
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ErrorFactory.unauthorized("Access token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw ErrorFactory.unauthorized("Invalid access token");
      }
      throw ErrorFactory.unauthorized("Token verification failed");
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(
        token,
        this.REFRESH_TOKEN_SECRET,
      ) as RefreshTokenPayload;

      if (!decoded.userId || !decoded.jti || !decoded.sessionId) {
        throw ErrorFactory.unauthorized(
          "Invalid refresh token payload structure",
        );
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ErrorFactory.unauthorized("Refresh token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw ErrorFactory.unauthorized("Invalid refresh token");
      }
      throw ErrorFactory.unauthorized("Refresh token verification failed");
    }
  }

  generateTokenPair(
    userId: string,
    email: string,
    emailVerified: boolean,
    sessionId: string,
  ): { accessToken: string; refreshToken: string; expiresIn: number } {
    const accessToken = this.generateAccessToken({
      userId,
      email,
      emailVerified,
      sessionId,
    });

    const refreshToken = this.generateRefreshToken(userId, sessionId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    };
  }

  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      if (!decoded || !decoded.exp) {
        return null;
      }
      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }
}

export const tokenService = new TokenService();
