import { UserRoleEnum } from "@prisma/client";
import prisma from "../db/prismaClient";
import { ErrorFactory } from "./globalErrorHandler";
import { orgRole } from "../types/authTypes";
import { orgPayload } from "../types/orgTypes";

// Union type to accept either structure
type OrgRolesInput = orgRole[] | orgPayload["orgRoles"];

/**
 * Determine the primary role of the user in the organization by fetching role information from database.
 * Priority: OWNER > ADMIN > MEMBER
 */
export async function determineUserRole(
  orgRoles: OrgRolesInput,
): Promise<UserRoleEnum> {
  if (!orgRoles || orgRoles.length === 0) {
    throw ErrorFactory.forbidden("No roles found for user in organization");
  }

  // Extract roleIds from either structure
  const roleIds = orgRoles.map((r) => r.roleId);
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true, systemRoleType: true },
  });

  // Create a map of roleId to systemRoleType
  const roleMap = new Map(roles.map((r) => [r.id, r.systemRoleType]));

  const roleHierarchy = [
    UserRoleEnum.MEMBER,
    UserRoleEnum.ADMIN,
    UserRoleEnum.OWNER,
  ];

  let highestRole: UserRoleEnum = UserRoleEnum.MEMBER;
  let highestPriority = -1;

  for (const orgRole of orgRoles) {
    const roleName = roleMap.get(orgRole.roleId);
    if (roleName) {
      const priority = roleHierarchy.indexOf(roleName);
      if (priority > highestPriority) {
        highestPriority = priority;
        highestRole = roleName;
      }
    }
  }

  return highestRole;
}

/**
 * Check if user has a specific role in their accessible organizations.
 * Fetches role information from database since it's not in JWT token.
 */
export async function hasRole(
  orgRoles: OrgRolesInput,
  requiredRoleName: UserRoleEnum,
): Promise<boolean> {
  // Extract roleIds from either structure
  const roleIds = orgRoles.map((r) => r.roleId);

  const roles = await prisma.role.findMany({
    where: {
      id: { in: roleIds },
      systemRoleType: requiredRoleName,
    },
    select: { id: true },
  });

  return roles.length > 0;
}
