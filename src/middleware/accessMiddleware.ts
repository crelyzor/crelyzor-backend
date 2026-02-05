import { Request, Response, NextFunction } from "express";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { AuthenticatedUser } from "../types/authTypes";
import prisma from "../db/prismaClient";

/**
 * Middleware factory to enforce permission-based access control using cached permissions.
 *
 * This middleware checks whether the authenticated user has the specified permission
 * using the pre-computed activePermissions from req.org (populated by resolveOrgContext).
 *
 * Benefits:
 * - Zero database queries during permission checks
 * - Permissions are cached in the organization context
 * - Supports hierarchy-aware permissions (inherited from ancestor orgs)
 *
 * Prerequisites:
 * - verifyJWT middleware must run first (populates req.user)
 * - resolveOrgContext middleware must run first (populates req.org.activePermissions)
 *
 * @param {string} permissionName - The name of the permission required (e.g., "CREATE_USER")
 *
 * @returns {(req: Request, res: Response, next: NextFunction) => void} - Express middleware
 *
 * @throws {ForbiddenError} If user does not have the required permission
 *
 * @author Hierarchy Auth Refactor
 */

export const requirePermission = (permissionName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const org = req.org;

    console.log("[requirePermission] Checking permission:", permissionName);
    console.log("[requirePermission] req.org:", JSON.stringify(org, null, 2));

    if (!org || !org.activePermissions) {
      console.error(
        "[requirePermission] ERROR: Organization context is missing",
      );
      return globalErrorHandler(
        ErrorFactory.forbidden("Organization context is missing"),
        req,
        res,
      );
    }

    console.log(
      "[requirePermission] Active permissions:",
      org.activePermissions,
    );

    if (!org.activePermissions.includes(permissionName)) {
      console.error(
        "[requirePermission] ERROR: Permission denied -",
        permissionName,
        "not in",
        org.activePermissions,
      );
      return globalErrorHandler(
        ErrorFactory.forbidden(
          `Permission denied: ${permissionName} is required`,
        ),
        req,
        res,
      );
    }

    console.log("[requirePermission] ✅ Permission check passed");
    next();
  };
};

/**
 * Middleware factory to check permissions directly from user's token.
 *
 * This is useful for listing endpoints where user can query multiple child orgs.
 * Since permissions are no longer in the JWT token, this fetches them from the database.
 *
 * Prerequisites:
 * - verifyJWT middleware must run first (populates req.user with orgRoles)
 *
 * @param {string} permissionName - The name of the permission required
 *
 * @returns {(req: Request, res: Response, next: NextFunction) => void} - Express middleware
 *
 * @throws {ForbiddenError} If user does not have the required permission in any of their orgs
 */
export const requirePermissionFromToken = (permissionName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as AuthenticatedUser;

      if (!user || !user.orgRoles || user.orgRoles?.length === 0) {
        return globalErrorHandler(
          ErrorFactory.forbidden("User is not a member of any organization"),
          req,
          res,
        );
      }

      // Fetch permissions from database since they're not in token
      const roleIds = user.orgRoles?.map((orgRole: any) => orgRole.roleId);

      const rolesWithPermissions = await prisma.role.findMany({
        where: { id: { in: roleIds } },
        include: {
          permissions: {
            where: { isActive: true, name: permissionName },
            select: { name: true },
          },
        },
      });

      // Check if user has the permission in any of their roles
      const hasPermission = rolesWithPermissions.some(
        (role) => role.permissions.length > 0,
      );

      if (!hasPermission) {
        return globalErrorHandler(
          ErrorFactory.forbidden(
            `Permission denied: ${permissionName} is required`,
          ),
          req,
          res,
        );
      }

      next();
    } catch (error) {
      return globalErrorHandler(error as any, req, res);
    }
  };
};
