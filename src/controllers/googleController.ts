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
  // 🔹 1. Google Sign-In (no JWT needed)
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

      const parsedState = state ? JSON.parse(String(state)) : {};
      const redirectUrl = parsedState.redirectUrl;

      if (!redirectUrl) {
        throw ErrorFactory.validation("Redirect URL not found in state");
      }

      // 1️⃣ Exchange code for Google tokens and user info
      const { email, name, picture, googleId, tokens } =
        await googleService.handleLoginCallback(String(code));

      // 2️⃣ Find or create user
      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Auto-create user on first Google login
        user = await prisma.user.create({
          data: {
            email,
            name,
            avatarUrl: picture,
            isActive: true,
          },
        });

        // 🆕 Auto-create personal organization for new user
        const personalOrg = await prisma.organization.create({
          data: {
            name: `${name}'s Workspace`,
            description: "Personal workspace",
            organizationDetails: {},
            isPersonal: true,
          },
        });

        // Add user as OWNER of their personal organization
        await prisma.organizationMember.create({
          data: {
            orgId: personalOrg.id,
            userId: user.id,
            accessLevel: "OWNER",
          },
        });

        // Invalidate cache so new org data is loaded
        const { orgRoleCacheService } =
          await import("../services/auth/orgRoleCacheService");
        await orgRoleCacheService.invalidateUserOrgRoles(user.id);
      }

      if (!user.isActive) {
        throw ErrorFactory.unauthorized("User account is inactive");
      }

      // 3️⃣ Save Google OAuth tokens in DB
      await prisma.oAuthAccount.upsert({
        where: {
          provider_providerId: {
            provider: "GOOGLE",
            providerId: googleId,
          },
        },
        update: {
          accessToken: tokens.access_token ?? "",
          refreshToken: tokens.refresh_token ?? "",
          expiry: tokens.expiry_date
            ? Math.floor(tokens.expiry_date / 1000)
            : 0,
          scopes: tokens.scope?.split(" ") ?? [],
          userId: user.id, // ✅ now we have a real UUID
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
          userId: user.id, // ✅ valid UUID
        },
      });

      // 4️⃣ Get user's organization (for personal workspace)
      const userOrg = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        select: { orgId: true },
      });

      // 5️⃣ Generate your app's tokens
      const jwtTokens = await authService.generateTokens(user);

      // 6️⃣ Redirect to frontend with access token, refresh token, and organization ID
      const finalRedirectUrl = `${redirectUrl}?accessToken=${jwtTokens.accessToken}&refreshToken=${jwtTokens.refreshToken}&organizationId=${userOrg?.orgId || ""}`;

      res.redirect(finalRedirectUrl);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  async redirectToGoogleCalendar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

      const redirectUrl = req.query.redirectUrl as string;
      const organizationId = req.query.organizationId as string;

      if (!redirectUrl) {
        throw ErrorFactory.validation(
          "redirectUrl query parameter is required",
        );
      }

      // 1️⃣ Check if user already connected Google Calendar
      const existing = await prisma.oAuthAccount.findFirst({
        where: { userId, provider: "GOOGLE" },
      });

      if (existing) {
        // 2️⃣ Already connected → respond instantly
        res.status(200).json({
          message: "Google Calendar already connected",
          connected: true,
        });
        return;
      }

      // 3️⃣ Not connected → generate Google consent URL
      const url = await googleService.getCalendarAuthUrl(
        userId,
        redirectUrl,
        organizationId,
      );

      // 4️⃣ Redirect to Google OAuth page
      return res.redirect(url);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  async handleGoogleCalendarCallback(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { code, state } = req.query;
      if (!code) throw ErrorFactory.validation("Missing authorization code");

      const parsedState = state ? JSON.parse(String(state)) : {};
      const userId = parsedState.userId;
      const redirectUrl = parsedState.redirectUrl;
      const organizationId = parsedState.organizationId;

      if (!userId)
        throw ErrorFactory.unauthorized("User not found during callback");

      if (!redirectUrl)
        throw ErrorFactory.validation("Redirect URL not found in state");

      await googleService.handleCalendarOAuthCallback(userId, String(code));

      res.redirect(redirectUrl);
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  // 🔹 3. Calendar CRUD APIs (JWT required)
  // async createEvent(req: Request, res: Response): Promise<void> {
  //   try {
  //     const userId = req.user?.userId;
  //     if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

  //     const { organizationId, ...eventData } = req.body;

  //     // Create event in Google Calendar with Meet link
  //     const googleEvent = await googleService.createEvent(userId, {
  //       ...eventData,
  //       conferenceData: {
  //         createRequest: {
  //           requestId: `${userId}-${Date.now()}`,
  //           conferenceSolutionKey: { type: "hangoutsMeet" },
  //         },
  //       },
  //     });

  //     // Extract Meet link
  //     const meetLink = googleEvent.hangoutLink || googleEvent.conferenceData?.entryPoints?.find(
  //       (ep: any) => ep.entryPointType === "video"
  //     )?.uri;

  //     // Also create event in CRM if organizationId is provided
  //     if (organizationId) {
  //       try {
  //         // Get user's orgMemberId for this organization
  //         const orgMember = await prisma.organizationMember.findFirst({
  //           where: { userId, orgId: organizationId },
  //           select: { id: true },
  //         });

  //         await crmClient.createEvent({
  //           organizationId,
  //           orgMemberId: orgMember?.id,
  //           name: eventData.summary || "Untitled Event",
  //           description: eventData.description,
  //           date: eventData.start
  //             ? new Date(eventData.start).toISOString().split("T")[0]
  //             : undefined,
  //           startTime: eventData.start
  //             ? new Date(eventData.start).toTimeString().split(" ")[0]
  //             : undefined,
  //           endTime: eventData.end
  //             ? new Date(eventData.end).toTimeString().split(" ")[0]
  //             : undefined,
  //           meetingLink: meetLink,
  //           createdBy: userId,
  //         });
  //       } catch (crmError) {
  //         console.error("Failed to sync event to CRM:", crmError);
  //         // Don't fail the request if CRM sync fails
  //       }
  //     }

  //     apiResponse(res, {
  //       statusCode: 201,
  //       message: "Event created successfully",
  //       data: {
  //         ...googleEvent,
  //         meetLink,
  //       },
  //     });
  //   } catch (error) {
  //     globalErrorHandler(error as BaseError, req, res);
  //   }
  // },

  // async deleteEvent(req: Request, res: Response): Promise<void> {
  //   try {
  //     const userId = req.user?.userId;
  //     if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

  //     const eventId = req.params.id;
  //     await googleService.deleteEvent(userId, eventId);

  //     apiResponse(res, {
  //       statusCode: 200,
  //       message: "Event deleted successfully",
  //     });
  //   } catch (error) {
  //     globalErrorHandler(error as BaseError, req, res);
  //   }
  // },

  // 🔹 4. Get Synced Calendar Events (JWT required)
  async getSyncedEvents(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

      const organizationId = req.query.organizationId as string;

      // Get events from local database (Google Calendar synced events)
      const googleEvents = await prisma.googleCalendarEvent.findMany({
        where: { userId },
        orderBy: { startTime: "asc" },
      });

      // CRM events removed - now using internal Meeting model
      const crmEvents: unknown[] = [];

      apiResponse(res, {
        statusCode: 200,
        message: "Synced events fetched successfully",
        data: {
          googleEvents,
          crmEvents,
          totalCount: googleEvents.length + crmEvents.length,
        },
      });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  // 🔹 Get Events by Date (JWT required)
  async getEventsByDate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

      const { date, organizationId } = req.body;
      if (!date) {
        throw ErrorFactory.validation("Date is required in request body");
      }

      // Parse the date and create start/end of day boundaries
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      // Get Google Calendar events for that specific day
      const googleEvents = await prisma.googleCalendarEvent.findMany({
        where: {
          userId,
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        orderBy: { startTime: "asc" },
      });

      // Also fetch CRM events for that date if organizationId is provided
      // CRM events removed - now using internal Meeting model
      const crmEvents: unknown[] = [];

      apiResponse(res, {
        statusCode: 200,
        message: `Events fetched for ${date}`,
        data: {
          date,
          googleEventCount: googleEvents.length,
          crmEventCount: crmEvents.length,
          totalEventCount: googleEvents.length + crmEvents.length,
          googleEvents,
          crmEvents,
        },
      });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  // 🔹 Check Calendar Access Status (JWT required)
  async checkCalendarAccess(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

      const hasCalendar = await prisma.oAuthAccount.findFirst({
        where: { userId, provider: "GOOGLE" },
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Calendar access status retrieved",
        data: {
          hasCalendarAccess: !!hasCalendar,
          connectedAt: hasCalendar?.createdAt || null,
        },
      });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  // 🔹 5. Manual Sync Trigger (JWT required) - Deprecated, CRM sync removed
  async triggerSync(req: Request, res: Response): Promise<void> {
    apiResponse(res, {
      statusCode: 200,
      message: "Sync completed (no external CRM configured)",
      data: { synced: 0 },
    });
  },

  // 🔹 6. Get Google Scopes Status (JWT required)
  async getScopesStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

      const scopesStatus = await googleService.checkScopesStatus(userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Google scopes status retrieved successfully",
        data: scopesStatus,
      });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
