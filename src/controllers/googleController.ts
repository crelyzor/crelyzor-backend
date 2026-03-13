import { Request, Response } from "express";
import { googleService } from "../services/googleService";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { authService } from "../services/auth/authService";
import prisma from "../db/prismaClient";

export const googleController = {
  async redirectToGoogleLogin(req: Request, res: Response): Promise<void> {
    try {
      const redirectUrl = req.query.redirectUrl as string;
      if (!redirectUrl) {
        throw ErrorFactory.validation(
          "redirectUrl query parameter is required",
        );
      }

      const url = googleService.getLoginUrl(redirectUrl);
      res.redirect(url);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
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

      const { email, name, picture, googleId, tokens } =
        await googleService.handleLoginCallback(String(code));

      const user = await prisma.$transaction(
        async (tx) => {
          let u = await tx.user.findUnique({ where: { email } });

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

          return u;
        },
        { timeout: 15000 },
      );

      const jwtTokens = await authService.generateTokens(user);
      const finalRedirectUrl = `${redirectUrl}?accessToken=${jwtTokens.accessToken}&refreshToken=${jwtTokens.refreshToken}`;

      res.redirect(finalRedirectUrl);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
