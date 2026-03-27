import { Request, Response } from "express";
import { googleService } from "../services/googleService";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { authService } from "../services/auth/authService";
import prisma from "../db/prismaClient";

const ALLOWED_REDIRECT_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const { origin } = new URL(url);
    return ALLOWED_REDIRECT_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

export const googleController = {
  async redirectToGoogleLogin(req: Request, res: Response): Promise<void> {
    try {
      const redirectUrl = req.query.redirectUrl as string;
      if (!redirectUrl) {
        throw ErrorFactory.validation(
          "redirectUrl query parameter is required",
        );
      }
      if (!isAllowedRedirectUrl(redirectUrl)) {
        throw ErrorFactory.validation("redirectUrl must be a trusted origin");
      }

      const url = googleService.getLoginUrl(redirectUrl);
      res.redirect(url);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  // ── Calendar connect ──

  /**
   * POST /auth/google/calendar/connect
   * Authenticated (verifyJWT). Returns the Google OAuth URL for calendar scope.
   * Frontend calls this via fetch (with Authorization header), then navigates to the URL.
   * This avoids passing the JWT as a query parameter in a browser redirect.
   */
  async getCalendarConnectUrl(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { redirectUrl } = req.body as { redirectUrl?: string };

      if (!redirectUrl) {
        throw ErrorFactory.validation("redirectUrl is required");
      }
      if (!isAllowedRedirectUrl(redirectUrl)) {
        throw ErrorFactory.validation("redirectUrl must be a trusted origin");
      }

      const url = googleService.getCalendarConnectUrl(redirectUrl, userId);
      res.json({ url });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  async handleCalendarConnectCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { code, state, error } = req.query;

    // Extract redirectUrl from state before signature verification so we can
    // always redirect back to the frontend — even on error or denial.
    const fallbackRedirect =
      (process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim() ??
        "http://localhost:5173") + "/settings?tab=integrations";

    let redirectUrl = fallbackRedirect;
    try {
      const parsed = JSON.parse(String(state ?? "{}"));
      if (
        parsed.redirectUrl &&
        typeof parsed.redirectUrl === "string" &&
        isAllowedRedirectUrl(parsed.redirectUrl)
      ) {
        redirectUrl = parsed.redirectUrl;
      }
    } catch {
      // Use fallback — state is malformed
    }

    const sep = redirectUrl.includes("?") ? "&" : "?";

    // User denied calendar permission — redirect back cleanly
    if (error === "access_denied") {
      res.redirect(`${redirectUrl}${sep}calendarConnected=false`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${redirectUrl}${sep}error=calendar_connect_failed`);
      return;
    }

    try {
      await googleService.handleCalendarConnectCallback(
        String(code),
        String(state),
      );
      res.redirect(`${redirectUrl}${sep}calendarConnected=true`);
    } catch {
      res.redirect(`${redirectUrl}${sep}error=calendar_connect_failed`);
    }
  },

  async handleGoogleLoginCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;
      if (!code) throw ErrorFactory.validation("Missing authorization code");

      let parsedState: { redirectUrl?: string } = {};
      try {
        parsedState = state ? JSON.parse(String(state)) : {};
      } catch {
        throw ErrorFactory.validation("Invalid OAuth state parameter");
      }
      const redirectUrl = parsedState.redirectUrl;

      if (!redirectUrl) {
        throw ErrorFactory.validation("Redirect URL not found in state");
      }
      if (!isAllowedRedirectUrl(redirectUrl)) {
        throw ErrorFactory.validation("Redirect URL is not a trusted origin");
      }

      const { email, name, picture, googleId, tokens } =
        await googleService.handleLoginCallback(String(code));

      const user = await prisma.$transaction(
        async (tx) => {
          let u = await tx.user.findUnique({ where: { email } });
          const isNewUser = !u;

          if (!u) {
            u = await tx.user.create({
              data: { email, name, avatarUrl: picture, isActive: true },
            });
          }

          if (!u.isActive) {
            throw ErrorFactory.unauthorized("User account is inactive");
          }

          await tx.oAuthAccount.upsert({
            where: {
              provider_providerId: { provider: "GOOGLE", providerId: googleId },
            },
            update: {
              accessToken: tokens.access_token ?? "",
              refreshToken: tokens.refresh_token ?? "",
              expiry: tokens.expiry_date
                ? Math.floor(tokens.expiry_date / 1000)
                : 0,
              scopes: tokens.scope?.split(" ") ?? [],
              userId: u.id,
            },
            create: {
              provider: "GOOGLE",
              providerId: googleId,
              accessToken: tokens.access_token ?? "",
              refreshToken: tokens.refresh_token ?? "",
              expiry: tokens.expiry_date
                ? Math.floor(tokens.expiry_date / 1000)
                : 0,
              scopes: tokens.scope?.split(" ") ?? [],
              userId: u.id,
            },
          });

          // Auto-create UserSettings + default schedule + Mon–Fri slots for new users
          if (isNewUser) {
            await tx.userSettings.create({ data: { userId: u.id } });
            const defaultSchedule = await tx.availabilitySchedule.create({
              data: {
                userId: u.id,
                name: "Working Hours",
                timezone: u.timezone ?? "UTC",
                isDefault: true,
              },
              select: { id: true },
            });
            await tx.availability.createMany({
              data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
                scheduleId: defaultSchedule.id,
                dayOfWeek,
                startTime: "09:00",
                endTime: "17:00",
              })),
              skipDuplicates: true,
            });
          }

          return u;
        },
        { timeout: 15000 },
      );

      const jwtTokens = await authService.generateTokens(user);
      // Use hash fragment to keep tokens out of server logs and referrer headers
      const finalRedirectUrl = `${redirectUrl}#accessToken=${jwtTokens.accessToken}&refreshToken=${jwtTokens.refreshToken}`;

      res.redirect(finalRedirectUrl);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
