import { Request, Response, NextFunction } from "express";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { AuthenticatedUser } from "../types/authTypes";
import { UserRoleEnum } from "@prisma/client";
import prisma from "../db/prismaClient";

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
          permissions: string[];
        };
      }[];
      activePermissions?: string[];
    };
  }
}

/**
 * Middleware to resolve the organization context.
 *
 * Simplified for flat organization structure (no hierarchy).
 * User must be a direct member of the target organization.
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

    // Fetch permissions from database for user's roles
    const roleIds = directMembershipRoles.map((r) => r.roleId);

    const rolesWithPermissions = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      include: {
        permissions: {
          where: { isActive: true },
          select: { name: true },
        },
      },
    });

    // Aggregate permissions from all roles
    const allPermissions = new Set<string>();
    const rolePermissionsMap = new Map<string, string[]>();

    rolesWithPermissions.forEach((role) => {
      const perms = role.permissions.map((p) => p.name);
      rolePermissionsMap.set(role.id, perms);
      perms.forEach((perm) => allPermissions.add(perm));
    });

    (req as any).org = {
      orgId: targetOrgId,
      orgRoles: directMembershipRoles.map((r) => ({
        orgMemberId: r.orgMemberId,
        roleId: r.roleId,
        role: {
          roleName: r.role.roleName,
          roleId: r.roleId,
          permissions: rolePermissionsMap.get(r.roleId) || [],
        },
      })),
      activePermissions: Array.from(allPermissions),
    };

    return next();
  } catch (error) {
    globalErrorHandler(error as any, req, res);
  }
};
