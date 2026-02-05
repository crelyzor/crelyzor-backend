import { Request, Response, NextFunction } from "express";
import { UserRoleEnum } from "@prisma/client";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { determineUserRole } from "../utils/roleUtils";
import { orgPayload } from "../types/orgTypes";
import prisma from "../db/prismaClient";

/**
 * Middleware factory to enforce role-based access control.
 *
 * Simple role check - verifies user has one of the allowed roles.
 *
 * @param allowedRoles - Array of allowed roles (e.g., [UserRoleEnum.OWNER, UserRoleEnum.ADMIN])
 *
 * @example
 * router.delete(
 *   "/",
 *   verifyJWT,
 *   resolveOrgContext,
 *   requireRole([UserRoleEnum.OWNER]),  // Only OWNER can delete
 *   controller.deleteOrganization
 * );
 */
export const requireRole = (allowedRoles: UserRoleEnum[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = req.org as orgPayload;

      if (!org || !org.orgRoles || org.orgRoles.length === 0) {
        console.error("[requireRole] Organization context is missing");
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization context is missing"),
          req,
          res,
        );
      }

      // Get user's highest priority role
      const userRole = await determineUserRole(org.orgRoles);

      // Check if user has one of the allowed roles
      if (!allowedRoles.includes(userRole)) {
        console.error(
          `[requireRole] Access denied - User role ${userRole} not in allowed roles: ${allowedRoles.join(", ")}`,
        );
        return globalErrorHandler(
          ErrorFactory.forbidden(
            `Access denied. Required role: ${allowedRoles.join(" or ")}`,
          ),
          req,
          res,
        );
      }

      console.log(`[requireRole] ✅ Access granted - User role: ${userRole}`);
      next();
    } catch (error) {
      console.error("[requireRole] Error during role check:", error);
      return globalErrorHandler(error as any, req, res);
    }
  };
};

/**
 * Middleware factory to enforce resource ownership.
 *
 * Verifies that the user owns the resource they're trying to access.
 * Used for MEMBER role to restrict access to only their own resources.
 *
 * @param resourceType - Type of resource ('meeting', 'availability', etc.)
 * @param idParamName - Name of the route parameter containing the resource ID (default: 'id')
 *
 * @example
 * router.patch(
 *   "/:meetingId",
 *   verifyJWT,
 *   resolveOrgContext,
 *   requireOwnership('meeting', 'meetingId'),
 *   controller.updateMeeting
 * );
 */
export const requireOwnership = (
  resourceType: string,
  idParamName: string = "id",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = req.org as orgPayload;
      const resourceId = req.params[idParamName];

      if (!org || !org.orgRoles || org.orgRoles.length === 0) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization context is missing"),
          req,
          res,
        );
      }

      if (!resourceId) {
        return globalErrorHandler(
          ErrorFactory.validation(`Resource ID (${idParamName}) is required`),
          req,
          res,
        );
      }

      // Get orgMemberId from org context
      const orgMemberId = org.orgRoles[0]?.orgMemberId;
      if (!orgMemberId) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization member ID not found"),
          req,
          res,
        );
      }

      // Check ownership based on resource type
      let isOwner = false;

      switch (resourceType) {
        case "meeting": {
          const meeting = await prisma.meeting.findUnique({
            where: { id: resourceId },
            select: {
              createdById: true,
              participants: {
                where: { orgMemberId },
                select: { orgMemberId: true },
              },
            },
          });

          if (!meeting) {
            return globalErrorHandler(
              ErrorFactory.notFound("Meeting not found"),
              req,
              res,
            );
          }

          // User owns if they created it or are a participant
          isOwner =
            meeting.createdById === orgMemberId ||
            meeting.participants.length > 0;
          break;
        }

        case "availability": {
          const availability = await prisma.memberAvailability.findFirst({
            where: {
              id: resourceId,
              orgMemberId,
            },
            select: { id: true },
          });

          isOwner = !!availability;
          break;
        }

        case "customSlot": {
          const customSlot = await prisma.memberCustomSlot.findFirst({
            where: {
              id: resourceId,
              orgMemberId,
            },
            select: { id: true },
          });

          isOwner = !!customSlot;
          break;
        }

        case "blockedTime": {
          const blockedTime = await prisma.memberBlockedTime.findFirst({
            where: {
              id: resourceId,
              orgMemberId,
            },
            select: { id: true },
          });

          isOwner = !!blockedTime;
          break;
        }

        default:
          return globalErrorHandler(
            ErrorFactory.validation(`Unknown resource type: ${resourceType}`),
            req,
            res,
          );
      }

      if (!isOwner) {
        console.error(
          `[requireOwnership] Access denied - User ${orgMemberId} does not own ${resourceType} ${resourceId}`,
        );
        return globalErrorHandler(
          ErrorFactory.forbidden(
            "Access denied. You can only access your own resources.",
          ),
          req,
          res,
        );
      }

      console.log(
        `[requireOwnership] ✅ Ownership verified for ${resourceType} ${resourceId}`,
      );
      next();
    } catch (error) {
      console.error("[requireOwnership] Error during ownership check:", error);
      return globalErrorHandler(error as any, req, res);
    }
  };
};

/**
 * Middleware factory combining role and ownership checks.
 *
 * Allows access if user has one of the allowed roles OR owns the resource.
 * Perfect for MEMBER role: they can access own resources, while ADMIN/OWNER can access all.
 *
 * @param allowedRoles - Array of roles that bypass ownership check
 * @param resourceType - Type of resource to check ownership for
 * @param idParamName - Name of route parameter containing resource ID
 *
 * @example
 * router.patch(
 *   "/:meetingId",
 *   verifyJWT,
 *   resolveOrgContext,
 *   requireRoleOrOwnership([UserRoleEnum.OWNER, UserRoleEnum.ADMIN], 'meeting', 'meetingId'),
 *   controller.updateMeeting
 * );
 * // MEMBER can edit own meetings, ADMIN/OWNER can edit any meeting
 */
export const requireRoleOrOwnership = (
  allowedRoles: UserRoleEnum[],
  resourceType: string,
  idParamName: string = "id",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = req.org as orgPayload;

      if (!org || !org.orgRoles || org.orgRoles.length === 0) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization context is missing"),
          req,
          res,
        );
      }

      // Get user's highest priority role
      const userRole = await determineUserRole(org.orgRoles);

      // If user has one of the allowed roles, grant access immediately
      if (allowedRoles.includes(userRole)) {
        console.log(
          `[requireRoleOrOwnership] ✅ Access granted - User has role ${userRole}`,
        );
        return next();
      }

      // Otherwise, check resource ownership
      const resourceId = req.params[idParamName];
      if (!resourceId) {
        return globalErrorHandler(
          ErrorFactory.validation(`Resource ID (${idParamName}) is required`),
          req,
          res,
        );
      }

      const orgMemberId = org.orgRoles[0]?.orgMemberId;
      if (!orgMemberId) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization member ID not found"),
          req,
          res,
        );
      }

      // Check ownership based on resource type
      let isOwner = false;

      switch (resourceType) {
        case "meeting": {
          const meeting = await prisma.meeting.findUnique({
            where: { id: resourceId },
            select: {
              createdById: true,
              participants: {
                where: { orgMemberId },
                select: { orgMemberId: true },
              },
            },
          });

          if (!meeting) {
            return globalErrorHandler(
              ErrorFactory.notFound("Meeting not found"),
              req,
              res,
            );
          }

          isOwner =
            meeting.createdById === orgMemberId ||
            meeting.participants.length > 0;
          break;
        }

        case "availability": {
          const availability = await prisma.memberAvailability.findFirst({
            where: {
              id: resourceId,
              orgMemberId,
            },
            select: { id: true },
          });

          isOwner = !!availability;
          break;
        }

        case "customSlot": {
          const customSlot = await prisma.memberCustomSlot.findFirst({
            where: {
              id: resourceId,
              orgMemberId,
            },
            select: { id: true },
          });

          isOwner = !!customSlot;
          break;
        }

        case "blockedTime": {
          const blockedTime = await prisma.memberBlockedTime.findFirst({
            where: {
              id: resourceId,
              orgMemberId,
            },
            select: { id: true },
          });

          isOwner = !!blockedTime;
          break;
        }

        default:
          return globalErrorHandler(
            ErrorFactory.validation(`Unknown resource type: ${resourceType}`),
            req,
            res,
          );
      }

      if (!isOwner) {
        console.error(
          `[requireRoleOrOwnership] Access denied - User ${orgMemberId} does not have role ${allowedRoles.join(" or ")} and does not own ${resourceType} ${resourceId}`,
        );
        return globalErrorHandler(
          ErrorFactory.forbidden(
            `Access denied. Required role: ${allowedRoles.join(" or ")}, or ownership of the resource.`,
          ),
          req,
          res,
        );
      }

      console.log(
        `[requireRoleOrOwnership] ✅ Access granted - User owns ${resourceType} ${resourceId}`,
      );
      next();
    } catch (error) {
      console.error(
        "[requireRoleOrOwnership] Error during role/ownership check:",
        error,
      );
      return globalErrorHandler(error as any, req, res);
    }
  };
};
