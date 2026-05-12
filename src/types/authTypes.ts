export interface TokenPayload {
  userId: string;
  email: string;
  emailVerified: boolean;
  jti: string; // JWT ID for tracking
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  jti: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceInfo?: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  countryCode?: string;
  phoneNumber?: string;
  country?: string;
  state?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: UserResponse;
}

export interface UserResponse {
  id: string;
  email: string;
  username?: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
  countryCode?: string;
  phoneNumber?: string;
  country?: string;
  state?: string;
  lastLoginAt?: Date;
  isActive: boolean;
  plan: "FREE" | "PRO" | "BUSINESS";
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ConfirmResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string; // sourced from cookie or body
}

export interface LogoutRequest {
  refreshToken?: string;
  logoutAll?: boolean;
}

export interface SessionInfo {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  lastAccessedAt: Date;
  isCurrent: boolean;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  blockDurationMs: number;
}

export interface LoginAttempt {
  email: string;
  ipAddress: string;
  timestamp: Date;
  success: boolean;
}

export interface ActiveSession {
  sessionId: string;
  refreshTokenJti: string;
  userId: string;
  deviceInfo?: string;
  ipAddress?: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

// Used as jwt.verify cast result - structurally matches TokenPayload
export type AuthenticatedUser = TokenPayload & { type?: string };
