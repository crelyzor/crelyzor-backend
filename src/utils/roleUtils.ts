import { UserRoleEnum } from "@prisma/client";

/**
 * Check if a given accessLevel meets or exceeds the required role.
 * Hierarchy: OWNER > ADMIN > MEMBER
 */
export function hasRole(
  accessLevel: UserRoleEnum,
  requiredRole: UserRoleEnum,
): boolean {
  const hierarchy: Record<UserRoleEnum, number> = {
    [UserRoleEnum.MEMBER]: 0,
    [UserRoleEnum.ADMIN]: 1,
    [UserRoleEnum.OWNER]: 2,
  };

  return hierarchy[accessLevel] >= hierarchy[requiredRole];
}
