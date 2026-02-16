import { Request, Response, NextFunction } from "express";
import { UserRoleEnum } from "@prisma/client";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { hasRole } from "../utils/roleUtils";
import { orgPayload } from "../types/orgTypes";
import prisma from "../db/prismaClient";

/**
 * Middleware factory to enforce role-based access control.
 *
 * Simple role check - verifies user has one of the allowed roles.
 *
 * @param allowedRoles - Array of allowed roles (e.g., [UserRoleEnum.OWNER, UserRoleEnum.ADMIN])
 */
export const requireRole = (allowedRoles: UserRoleEnum[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = req.org as orgPayload;

      if (!org) {
        console.error("[requireRole] Organization context is missing");
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization context is missing"),
          req,
          res,
        );
      }

      if (!allowedRoles.includes(org.accessLevel)) {
        console.error(
          `[requireRole] Access denied - User role ${org.accessLevel} not in allowed roles: ${allowedRoles.join(", ")}`,
        );
        return globalErrorHandler(
          ErrorFactory.forbidden(
            `Access denied. Required role: ${allowedRoles.join(" or ")}`,
          ),
          req,
          res,
        );
      }

      console.log(`[requireRole] Access granted - User role: ${org.accessLevel}`);
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
 */
export const requireOwnership = (
  resourceType: string,
  idParamName: string = "id",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = req.org as orgPayload;
      const resourceId = req.params[idParamName];

      if (!org) {
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

      const orgMemberId = org.orgMemberId;
      if (!orgMemberId) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization member ID not found"),
          req,
          res,
        );
      }

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
        return globalErrorHandler(
          ErrorFactory.forbidden(
            "Access denied. You can only access your own resources.",
          ),
          req,
          res,
        );
      }

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
 */
export const requireRoleOrOwnership = (
  allowedRoles: UserRoleEnum[],
  resourceType: string,
  idParamName: string = "id",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = req.org as orgPayload;

      if (!org) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization context is missing"),
          req,
          res,
        );
      }

      // If user has one of the allowed roles, grant access immediately
      if (allowedRoles.includes(org.accessLevel)) {
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

      const orgMemberId = org.orgMemberId;
      if (!orgMemberId) {
        return globalErrorHandler(
          ErrorFactory.forbidden("Organization member ID not found"),
          req,
          res,
        );
      }

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
        return globalErrorHandler(
          ErrorFactory.forbidden(
            `Access denied. Required role: ${allowedRoles.join(" or ")}, or ownership of the resource.`,
          ),
          req,
          res,
        );
      }

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
