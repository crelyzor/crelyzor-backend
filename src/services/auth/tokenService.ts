import jwt from "jsonwebtoken";
import { v7 as uuidv7 } from "uuid";
import {
  TokenPayload,
  RefreshTokenPayload,
  TokenResponse,
  AuthenticatedUser,
} from "../../types/authTypes";
import { ErrorFactory } from "../../utils/globalErrorHandler";
class TokenService {
  private readonly ACCESS_TOKEN_SECRET: string;
  private readonly REFRESH_TOKEN_SECRET: string;
  private readonly ACCESS_TOKEN_EXPIRY = "1h"; // 1 hour
  private readonly REFRESH_TOKEN_EXPIRY = "7d"; // 7 days

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
      issuer: "sso-system",
      audience: "sso-clients",
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
      issuer: "sso-system",
      audience: "sso-clients",
    });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: "sso-system",
        audience: "sso-clients",
      }) as AuthenticatedUser;

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
      const decoded = jwt.verify(token, this.REFRESH_TOKEN_SECRET, {
        issuer: "sso-system",
        audience: "sso-clients",
      }) as RefreshTokenPayload;

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
      expiresIn: 3600, // 1 hour in seconds
    };
  }

  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return true;
      }
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  generatePasswordResetToken(userId: string, email: string): string {
    const payload = {
      userId,
      email,
      type: "password_reset",
      jti: uuidv7(),
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: "15m",
      issuer: "sso-system",
      audience: "password-reset",
    });
  }
  decodeTokenWithoutVerification(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }
  verifyPasswordResetToken(token: string): {
    userId: string;
    email: string;
    jti: string;
  } {
    try {
      const decoded = jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: "sso-system",
        audience: "password-reset",
      }) as AuthenticatedUser & {
        type: string;
      };

      if (
        !decoded.userId ||
        !decoded.email ||
        !decoded.jti ||
        decoded.type !== "password_reset"
      ) {
        throw ErrorFactory.unauthorized("Invalid password reset token");
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        jti: decoded.jti,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ErrorFactory.unauthorized("Password reset token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw ErrorFactory.unauthorized("Invalid password reset token");
      }
      throw ErrorFactory.unauthorized(
        "Password reset token verification failed",
      );
    }
  }
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return null;
      }
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  generateEmailVerificationToken(userId: string, email: string): string {
    const payload = {
      userId,
      email,
      type: "email_verification",
      jti: uuidv7(),
    };

    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, {
      expiresIn: "24h",
      issuer: "sso-system",
      audience: "email-verification",
    });
  }

  verifyEmailVerificationToken(token: string): {
    userId: string;
    email: string;
    jti: string;
  } {
    try {
      const decoded = jwt.verify(token, this.ACCESS_TOKEN_SECRET, {
        issuer: "sso-system",
        audience: "email-verification",
      }) as AuthenticatedUser & {
        type: string;
      };

      if (
        !decoded.userId ||
        !decoded.email ||
        !decoded.jti ||
        decoded.type !== "email_verification"
      ) {
        throw ErrorFactory.unauthorized("Invalid email verification token");
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        jti: decoded.jti,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ErrorFactory.unauthorized("Email verification token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw ErrorFactory.unauthorized("Invalid email verification token");
      }
      throw ErrorFactory.unauthorized(
        "Email verification token verification failed",
      );
    }
  }
}

export const tokenService = new TokenService();
