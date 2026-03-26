import crypto from "crypto";
import { google } from "googleapis";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import prisma from "../db/prismaClient";

const LOGIN_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
];

export function getOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri || process.env.GOOGLE_LOGIN_REDIRECT_URI!,
  );
}

// ── Calendar connect state signing (CSRF protection) ──

/** Sign state with HMAC-SHA256. Uses canonical string to avoid JSON key-ordering issues. */
function signCalendarState(redirectUrl: string, userId: string): string {
  const canonical = `${userId}:${redirectUrl}`;
  const sig = crypto
    .createHmac("sha256", process.env.JWT_SECRET!)
    .update(canonical)
    .digest("hex");
  return JSON.stringify({ redirectUrl, userId, sig });
}

/** Verify state signature (timing-safe). Returns { redirectUrl, userId } on success. */
function verifyCalendarState(raw: string): { redirectUrl: string; userId: string } {
  let parsed: { redirectUrl?: string; userId?: string; sig?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("Invalid OAuth state", 400);
  }

  const { redirectUrl, userId, sig } = parsed;
  if (!redirectUrl || !userId || !sig) {
    throw new AppError("Invalid OAuth state", 400);
  }

  const canonical = `${userId}:${redirectUrl}`;
  const expected = crypto
    .createHmac("sha256", process.env.JWT_SECRET!)
    .update(canonical)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new AppError("Invalid OAuth state signature", 400);
  }

  return { redirectUrl, userId };
}

export const googleService = {
  getLoginUrl(redirectUrl: string) {
    const redirectUri = `${process.env.BASE_URL}/auth/google/login/callback`;
    const client = getOAuthClient(redirectUri);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: LOGIN_SCOPES,
      state: JSON.stringify({ redirectUrl }),
    });
  },

  async handleLoginCallback(code: string) {
    const redirectUri = `${process.env.BASE_URL}/auth/google/login/callback`;
    const client = getOAuthClient(redirectUri);

    let tokens: import("googleapis").Auth.Credentials;
    try {
      const result = await client.getToken(code);
      tokens = result.tokens;
    } catch (err) {
      throw new AppError("Failed to exchange Google OAuth code", 502);
    }

    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    let data: Record<string, string | null | undefined>;
    try {
      const result = await oauth2.userinfo.get();
      data = result.data as Record<string, string | null | undefined>;
    } catch (err) {
      throw new AppError("Failed to fetch Google user info", 502);
    }

    if (!data.email || !data.id)
      throw new AppError("Google user info missing required fields", 502);

    return {
      email: data.email,
      name: data.name || "",
      picture: data.picture || "",
      googleId: data.id,
      tokens,
    };
  },

  // ── Google Calendar connect ──

  getCalendarConnectUrl(redirectUrl: string, userId: string): string {
    const redirectUri = `${process.env.BASE_URL}/auth/google/calendar/connect/callback`;
    const client = getOAuthClient(redirectUri);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: CALENDAR_SCOPES,
      state: signCalendarState(redirectUrl, userId),
      include_granted_scopes: true,
    });
  },

  /**
   * Exchanges the OAuth code for tokens, verifies state, and persists:
   * - Updated tokens + scopes on OAuthAccount
   * - googleCalendarEmail on UserSettings
   */
  async handleCalendarConnectCallback(
    code: string,
    stateRaw: string,
  ): Promise<void> {
    const { userId } = verifyCalendarState(stateRaw);

    const redirectUri = `${process.env.BASE_URL}/auth/google/calendar/connect/callback`;
    const client = getOAuthClient(redirectUri);

    let tokens: import("googleapis").Auth.Credentials;
    try {
      const result = await client.getToken(code);
      tokens = result.tokens;
    } catch {
      throw new AppError("Failed to exchange Google OAuth code", 502);
    }
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    let data: { email?: string | null; id?: string | null };
    try {
      const result = await oauth2.userinfo.get();
      data = result.data;
    } catch {
      throw new AppError("Failed to fetch Google user info", 502);
    }
    if (!data.email || !data.id) {
      throw new AppError("Google user info missing required fields", 502);
    }

    await prisma.$transaction(
      async (tx) => {
        // Verify the user still exists before writing — defense-in-depth
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!user) throw new AppError("User not found", 404);

        await tx.oAuthAccount.upsert({
          where: {
            provider_providerId: {
              provider: "GOOGLE",
              providerId: data.id!,
            },
          },
          update: {
            accessToken: tokens.access_token ?? "",
            // Only overwrite refresh_token if Google issued a new one — preserves the existing token otherwise
            ...(tokens.refresh_token
              ? { refreshToken: tokens.refresh_token }
              : {}),
            expiry: tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : 0,
            scopes: tokens.scope?.split(" ") ?? [],
            userId,
          },
          create: {
            provider: "GOOGLE",
            providerId: data.id!,
            accessToken: tokens.access_token ?? "",
            refreshToken: tokens.refresh_token ?? "",
            expiry: tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : 0,
            scopes: tokens.scope?.split(" ") ?? [],
            userId,
          },
        });

        await tx.userSettings.upsert({
          where: { userId },
          update: { googleCalendarEmail: data.email },
          create: { userId, googleCalendarEmail: data.email },
        });
      },
      { timeout: 15000 },
    );

    logger.info("Google Calendar connected", { userId, email: data.email });
  },
};
