import { Request, Response, NextFunction } from "express";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { AuthenticatedUser } from "../types/authTypes";
import { UserRoleEnum } from "@prisma/client";
import { determineUserRole } from "../utils/roleUtils";

declare module "express" {
  export interface Request {
    org?: {
      orgId: string;
      orgRoles: {
        orgMemberId: string;
        roleId: string;
        role: {
          roleName: UserRoleEnum | null;
          roleId: string;
        };
      }[];
      highestRole: UserRoleEnum;
    };
  }
}

/**
 * Middleware to resolve the organization context.
 *
 * Simplified role-based authorization:
 * - User must be a direct member of the target organization
 * - Determines user's highest priority role (OWNER > ADMIN > MEMBER)
 * - No permission fetching from database
 */
export const resolveOrgContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const targetOrgId = req.headers["x-organization-id"] as string;
    const user = req.user as AuthenticatedUser;

    if (!targetOrgId) {
      throw ErrorFactory.validation("Missing X-Organization-ID header");
    }

    // Check if user is a direct member of target org
    const directMembershipRoles =
      user.orgRoles?.filter((r) => r.orgId === targetOrgId) || [];

    if (directMembershipRoles.length === 0) {
      throw ErrorFactory.forbidden(
        "You do not have access to this organization",
      );
    }

    // Map roles to simplified structure (no permissions)
    const orgRoles = directMembershipRoles.map((r) => ({
      orgMemberId: r.orgMemberId,
      roleId: r.roleId,
      role: {
        roleName: r.role.roleName,
        roleId: r.roleId,
      },
    }));

    // Determine highest priority role (pass full directMembershipRoles which includes orgId)
    const highestRole = await determineUserRole(directMembershipRoles);

    (req as any).org = {
      orgId: targetOrgId,
      orgRoles,
      highestRole,
    };

    return next();
  } catch (error) {
    globalErrorHandler(error as any, req, res);
  }
};
