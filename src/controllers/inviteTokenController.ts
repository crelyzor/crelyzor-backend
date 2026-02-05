import { AuthenticatedUser } from "../types/authTypes";
import { Request, Response } from "express";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { orgPayload } from "../types/orgTypes";
import { inviteTokenService } from "../services/inviteTokenService";
import { z } from "zod";
import { UserRoleEnum } from "@prisma/client";

// Validation schemas
const SendInviteSchema = z.object({
  invitedEmail: z.string().email("Invalid email address"),
  invitedRole: z.nativeEnum(UserRoleEnum),
});

const TokenSchema = z.object({
  token: z.string().uuid("Invalid token format"),
});

const AcceptInviteSchema = z.object({
  token: z.string().uuid("Invalid token format"),
});

export const inviteTokenController = {
  /**
   * Send an invitation to join an organization
   * POST /api/v1/invite-tokens/send
   */
  sendInvite: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context missing");
      }

      const parsedData = SendInviteSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const { invitedEmail, invitedRole } = parsedData.data;

      const result = await inviteTokenService.sendInvite({
        organizationId: org.orgId,
        invitedEmail,
        invitedRole,
        invitedById: user.userId,
      });

      apiResponse(res, {
        statusCode: 201,
        message: result.message,
        data: {
          token: result.inviteToken,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      console.error("[SendInvite] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get invite details by token (for displaying org info)
   * POST /api/v1/invite-tokens/details
   */
  getInviteDetails: async (req: Request, res: Response): Promise<void> => {
    try {
      const parsedData = TokenSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const { token } = parsedData.data;

      const inviteDetails = await inviteTokenService.getInviteDetails(token);

      apiResponse(res, {
        statusCode: 200,
        message: "Invite details retrieved successfully",
        data: inviteDetails,
      });
    } catch (error) {
      console.error("[GetInviteDetails] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Accept an invite and join the organization
   * POST /api/v1/invite-tokens/accept
   */
  acceptInvite: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const parsedData = AcceptInviteSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const { token } = parsedData.data;

      const result = await inviteTokenService.acceptInvite({
        token,
        userId: user.userId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: {
          orgMemberId: result.orgMemberId,
          organizationId: result.organizationId,
        },
      });
    } catch (error) {
      console.error("[AcceptInvite] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * List all pending invites for an organization
   * GET /api/v1/invite-tokens/pending
   */
  listPendingInvites: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context missing");
      }

      const invites = await inviteTokenService.listPendingInvites(org.orgId);

      apiResponse(res, {
        statusCode: 200,
        message: "Pending invites retrieved successfully",
        data: { invites },
      });
    } catch (error) {
      console.error("[ListPendingInvites] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Cancel/revoke an invite
   * DELETE /api/v1/invite-tokens/:inviteId
   */
  cancelInvite: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      const { inviteId } = req.params;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context missing");
      }

      if (!inviteId) {
        throw ErrorFactory.validation("Invite ID is required");
      }

      const result = await inviteTokenService.cancelInvite(inviteId, org.orgId);

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (error) {
      console.error("[CancelInvite] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
