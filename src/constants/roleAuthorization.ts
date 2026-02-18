import { UserRoleEnum } from "@prisma/client";

/**
 * Role Authorization Constants
 *
 * Defines capabilities for each role in the system.
 * Simplified authorization model: OWNER > ADMIN > MEMBER
 */

/**
 * Role capabilities mapping
 *
 * Defines what each role can do in the system:
 * - OWNER: Full control of organization including deletion
 * - ADMIN: Manage organization, members, and all meetings
 * - MEMBER: Basic access, manage own resources only
 */
export const ROLE_CAPABILITIES = {
  [UserRoleEnum.OWNER]: {
    // Organization Management
    canManageOrganization: true,
    canDeleteOrganization: true,
    canManageRoles: true,

    // Member Management
    canManageMembers: true,
    canInviteMembers: true,
    canRemoveMembers: true,

    // Meeting Management
    canViewAllMeetings: true,
    canManageAllMeetings: true,
    canDeleteAnyMeeting: true,

    // Settings
    canManageOrganizationSettings: true,
  },

  [UserRoleEnum.ADMIN]: {
    // Organization Management
    canManageOrganization: true,
    canDeleteOrganization: false, // Only OWNER can delete
    canManageRoles: false, // Only OWNER can manage roles

    // Member Management
    canManageMembers: true,
    canInviteMembers: true,
    canRemoveMembers: true,

    // Meeting Management
    canViewAllMeetings: true,
    canManageAllMeetings: true,
    canDeleteAnyMeeting: true,

    // Settings
    canManageOrganizationSettings: true,
  },

  [UserRoleEnum.MEMBER]: {
    // Organization Management
    canManageOrganization: false,
    canDeleteOrganization: false,
    canManageRoles: false,

    // Member Management
    canManageMembers: false,
    canInviteMembers: false,
    canRemoveMembers: false,

    // Meeting Management
    canViewAllMeetings: false,
    canManageAllMeetings: false,
    canDeleteAnyMeeting: false,

    // Own Resources
    canManageOwnMeetings: true,
    canManageOwnAvailability: true,
    canManageOwnProfile: true,

    // Settings
    canManageOrganizationSettings: false,
  },
} as const;

/**
 * Helper functions for role capability checks
 */

export function canManageOrganization(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canManageOrganization ?? false;
}

export function canDeleteOrganization(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canDeleteOrganization ?? false;
}

export function canManageRoles(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canManageRoles ?? false;
}

export function canManageMembers(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canManageMembers ?? false;
}

export function canInviteMembers(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canInviteMembers ?? false;
}

export function canRemoveMembers(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canRemoveMembers ?? false;
}

export function canViewAllMeetings(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canViewAllMeetings ?? false;
}

export function canManageAllMeetings(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canManageAllMeetings ?? false;
}

export function canDeleteAnyMeeting(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canDeleteAnyMeeting ?? false;
}

export function canManageOrganizationSettings(role: UserRoleEnum): boolean {
  return ROLE_CAPABILITIES[role]?.canManageOrganizationSettings ?? false;
}

/**
 * Role hierarchy check
 *
 * Returns true if roleA has equal or higher priority than roleB
 * Hierarchy: OWNER > ADMIN > MEMBER
 */
export function isRoleHigherOrEqual(
  roleA: UserRoleEnum,
  roleB: UserRoleEnum,
): boolean {
  const hierarchy = [
    UserRoleEnum.MEMBER,
    UserRoleEnum.ADMIN,
    UserRoleEnum.OWNER,
  ];
  const priorityA = hierarchy.indexOf(roleA);
  const priorityB = hierarchy.indexOf(roleB);
  return priorityA >= priorityB;
}

/**
 * Check if role can perform action on target role
 *
 * Examples:
 * - OWNER can manage ADMIN and MEMBER
 * - ADMIN can manage MEMBER but not OWNER
 * - MEMBER cannot manage anyone
 */
export function canManageRole(
  managerRole: UserRoleEnum,
  targetRole: UserRoleEnum,
): boolean {
  // OWNER can manage anyone
  if (managerRole === UserRoleEnum.OWNER) {
    return true;
  }

  // ADMIN can manage MEMBER only
  if (
    managerRole === UserRoleEnum.ADMIN &&
    targetRole === UserRoleEnum.MEMBER
  ) {
    return true;
  }

  // MEMBER cannot manage anyone
  return false;
}

/**
 * Get human-readable role description
 */
export function getRoleDescription(role: UserRoleEnum): string {
  const descriptions = {
    [UserRoleEnum.OWNER]: "Full control of the organization including deletion",
    [UserRoleEnum.ADMIN]: "Manage organization settings, members, and meetings",
    [UserRoleEnum.MEMBER]: "Schedule meetings and manage personal availability",
  };

  return descriptions[role] || "Unknown role";
}

/**
 * Get allowed invite roles for a given role
 *
 * OWNER can invite: OWNER, ADMIN, MEMBER
 * ADMIN can invite: MEMBER only
 * MEMBER cannot invite anyone
 */
export function getAllowedInviteRoles(role: UserRoleEnum): UserRoleEnum[] {
  switch (role) {
    case UserRoleEnum.OWNER:
      return [UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER];
    case UserRoleEnum.ADMIN:
      return [UserRoleEnum.MEMBER];
    case UserRoleEnum.MEMBER:
      return [];
    default:
      return [];
  }
}
