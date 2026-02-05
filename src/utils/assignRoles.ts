import { Permission, UserRoleEnum } from "@prisma/client";
import { ErrorFactory } from "./globalErrorHandler";
import { Prisma } from "@prisma/client";
import { PERMISSIONS, getModuleForPermission } from "../constants/permissions";

interface AssignRoleParams {
  userId: string;
  orgId: string;
  orgMemberId?: string; // Optional - will be looked up if not provided
  roleId?: string; // Direct role ID (preferred)
  roleName?: UserRoleEnum; // For backward compatibility - will look up role by systemRoleType
  role?: UserRoleEnum; // Alias for roleName
}

interface RoleAssignmentResult {
  success: boolean;
  data?: {
    userRole: any;
    orgMember: any;
    permissions: string[];
  };
  message: string;
  errors?: string[];
}

/**
 * Assigns a role to a user within an organization.
 * Simplified - just creates a UserRole record pointing to an existing Role.
 *
 * @param params - Role assignment parameters
 * @returns Promise<RoleAssignmentResult>
 */
export async function assignUserRole(
  params: AssignRoleParams,
  tx: Prisma.TransactionClient,
): Promise<RoleAssignmentResult> {
  const { userId, orgId, roleId, roleName, role } = params;
  const effectiveRoleName = roleName || role;

  // Validate that either roleId OR roleName/role is provided
  if (!roleId && !effectiveRoleName) {
    throw ErrorFactory.validation("Either roleId or roleName/role must be provided");
  }

  console.log(`[AssignUserRole] Initiating role assignment`);
  console.log(`[AssignUserRole] Params:`, { userId, orgId, roleId, roleName });

  try {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      console.warn(`[AssignUserRole] User not found: ${userId}`);
      throw ErrorFactory.notFound(`User with ID ${userId} does not exist`);
    }

    console.log(`[AssignUserRole] User found: ${user.name} (${user.email})`);

    const organization = await tx.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!organization) {
      console.warn(`[AssignUserRole] Organization not found: ${orgId}`);
      throw ErrorFactory.notFound(
        `Organization with ID ${orgId} does not exist`,
      );
    }

    console.log(`[AssignUserRole] Organization found: ${organization.name}`);

    let orgMember = await tx.organizationMember.findFirst({
      where: {
        orgId: orgId,
        userId: userId,
      },
    });

    if (!orgMember) {
      console.warn(
        `[AssignUserRole] No organization member found for user ${userId} in org ${orgId}`,
      );
      throw ErrorFactory.notFound(
        `User with ID ${userId} is not a member of organization ${orgId}`,
      );
    }

    console.log(`[AssignUserRole] Found org member with ID: ${orgMember.id}`);

    // Find the role
    let foundRole;
    if (roleId) {
      foundRole = await tx.role.findFirst({
        where: { id: roleId, orgId, isActive: true },
        include: { permissions: { where: { isActive: true } } },
      });
    } else if (effectiveRoleName) {
      // Backward compatibility: look up by systemRoleType
      foundRole = await tx.role.findFirst({
        where: {
          orgId,
          systemRoleType: effectiveRoleName,
          isSystemRole: true,
          isActive: true,
        },
        include: { permissions: { where: { isActive: true } } },
      });
    }

    if (!foundRole) {
      throw ErrorFactory.notFound(`Role not found in this organization`);
    }

    console.log(`[AssignUserRole] Role found: ${foundRole.name}`);

    // Check if user already has this role
    const existingUserRole = await tx.userRole.findFirst({
      where: {
        userId: userId,
        roleId: foundRole.id,
        orgMemberId: orgMember.id,
      },
      include: {
        role: {
          include: { permissions: { where: { isActive: true } } },
        },
      },
    });

    if (existingUserRole) {
      console.log(
        `[AssignUserRole] User ${user.name} already has role ${foundRole.name} in ${organization.name}`,
      );

      return {
        success: true,
        data: {
          userRole: existingUserRole,
          orgMember,
          permissions: existingUserRole.role.permissions.map((p) => p.name),
        },
        message: `User ${user.name} already has role ${foundRole.name} in organization ${organization.name}`,
      };
    }

    // Create UserRole
    const userRole = await tx.userRole.create({
      data: {
        userId: userId,
        roleId: foundRole.id,
        orgMemberId: orgMember.id,
        isActive: true,
      },
      include: {
        role: {
          include: { permissions: { where: { isActive: true } } },
        },
      },
    });

    console.log(
      `[AssignUserRole] Created new userRole with ID: ${userRole.id}`,
    );

    // Update orgMember with role info
    orgMember = await tx.organizationMember.update({
      where: { id: orgMember.id },
      data: {
        roleId: userRole.id,
        updatedAt: new Date(),
      },
    });

    console.log(`[AssignUserRole] Linked role to org member ${orgMember.id}`);

    return {
      success: true,
      data: {
        userRole,
        orgMember,
        permissions: foundRole.permissions.map((p) => p.name),
      },
      message: `Successfully assigned role ${foundRole.name} to user ${user.name} in organization ${organization.name}`,
    };
  } catch (error) {
    console.error("[AssignUserRole] Error assigning role:", error);

    return {
      success: false,
      message: "Failed to assign role to user",
      errors: [
        error instanceof Error ? error.message : "Unknown error occurred",
      ],
    };
  }
}

export async function assignMultipleRoles(
  params: {
    userId: string;
    orgMemberId: string;
    orgId: string;
    roles: UserRoleEnum[];
  },
  tx: Prisma.TransactionClient,
) {
  const { userId, orgMemberId, orgId, roles } = params;
  const assignedRoles = [];

  const existingRoles = await tx.userRole.findMany({
    where: {
      userId,
      orgMemberId,
      isActive: true,
    },
    include: {
      role: true,
    },
  });

  const existingRoleTypes = existingRoles.map((r) => r.role.systemRoleType);

  for (const roleName of roles) {
    try {
      // Find the role in the organization
      const role = await tx.role.findFirst({
        where: {
          orgId,
          systemRoleType: roleName,
          isSystemRole: true,
          isActive: true,
        },
        include: {
          permissions: { where: { isActive: true } },
        },
      });

      if (!role) {
        console.warn(
          `[assignMultipleRoles] Role ${roleName} not found in org ${orgId}`,
        );
        continue;
      }

      const existingUserRole = await tx.userRole.findFirst({
        where: {
          userId,
          orgMemberId,
          roleId: role.id,
        },
        include: {
          role: {
            include: { permissions: { where: { isActive: true } } },
          },
        },
      });

      if (existingUserRole && existingUserRole.isActive) {
        console.log(
          `[assignMultipleRoles] User already has active role ${roleName}`,
        );
        assignedRoles.push({
          roleName,
          permissions: existingUserRole.role.permissions.map((p) => p.name),
        });
        continue;
      }

      const userRole = existingUserRole
        ? await tx.userRole.update({
            where: { id: existingUserRole.id },
            data: {
              isActive: true,
              updatedAt: new Date(),
            },
            include: {
              role: {
                include: { permissions: { where: { isActive: true } } },
              },
            },
          })
        : await tx.userRole.create({
            data: {
              userId,
              roleId: role.id,
              orgMemberId,
              isActive: true,
            },
            include: {
              role: {
                include: { permissions: { where: { isActive: true } } },
              },
            },
          });

      assignedRoles.push({
        roleName,
        permissions: userRole.role.permissions.map((p) => p.name),
      });

      console.log(
        `[assignMultipleRoles] Assigned role ${roleName} to user ${userId}`,
      );
    } catch (error) {
      console.error(
        `[assignMultipleRoles] Failed to assign role ${roleName}:`,
        error,
      );
      // Skip this role but continue with others
    }
  }

  return assignedRoles;
}

/**
 * @deprecated This function is no longer needed with the unified Role system.
 * Roles are now pre-created in the database and don't need per-user instances.
 * Use Role lookup directly instead.
 */
export async function createRolePermission(
  roleName: UserRoleEnum,
  orgId: string,
  tx: Prisma.TransactionClient,
) {
  console.warn(
    "[createRolePermission] DEPRECATED: This function should not be called in the new role system",
  );
  // For backward compatibility during migration, just return the role
  const role = await tx.role.findFirst({
    where: { orgId, systemRoleType: roleName, isSystemRole: true },
    include: { permissions: { where: { isActive: true } } },
  });

  if (!role) {
    throw ErrorFactory.notFound(`Role ${roleName} not found in organization`);
  }

  return role;
}

/**
 * Create default system roles for a new organization.
 * This creates Role records for all system role types with their default permissions.
 */
export async function createDefaultRoleTemplates(
  orgId: string,
  tx: Prisma.TransactionClient,
): Promise<{ id: string; name: string; systemRoleType: UserRoleEnum | null }[]> {
  const allRoles = Object.values(UserRoleEnum);
  const createdRoles: { id: string; name: string; systemRoleType: UserRoleEnum | null }[] = [];

  const ROLE_DESCRIPTIONS: Record<UserRoleEnum, string> = {
    [UserRoleEnum.OWNER]: "Full control of the organization including deletion",
    [UserRoleEnum.ADMIN]: "Manage organization settings, members, and meetings",
    [UserRoleEnum.MEMBER]: "Schedule meetings and manage personal availability",
  };

  for (const roleName of allRoles) {
    // Check if role already exists
    const existingRole = await tx.role.findFirst({
      where: {
        orgId,
        systemRoleType: roleName,
        isSystemRole: true,
      },
    });

    if (existingRole) {
      console.log(
        `[CreateDefaultRoleTemplates] Role ${roleName} already exists for org ${orgId}`,
      );
      createdRoles.push({
        id: existingRole.id,
        name: existingRole.name,
        systemRoleType: existingRole.systemRoleType,
      });
      continue;
    }

    // Get default permissions for this role
    const defaultPermissions = await getDefaultPermissionsForRole(roleName, tx);

    // Create system role
    const newRole = await tx.role.create({
      data: {
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName] || `${roleName} role`,
        isSystemRole: true,
        systemRoleType: roleName,
        orgId,
        isActive: true,
        permissions: {
          connect: defaultPermissions.map((p) => ({ id: p.id })),
        },
      },
    });

    createdRoles.push({
      id: newRole.id,
      name: newRole.name,
      systemRoleType: newRole.systemRoleType,
    });
  }

  console.log(
    `[CreateDefaultRoleTemplates] Created default system roles for organization ${orgId}`,
  );

  return createdRoles;
}

/**
 * Create default permissions for each role type.
 * This function defines the permission templates for your specific roles:
 * ADMIN, CONSULTANT, STUDENT, MENTOR, TEAM_MEMBER
 */
export async function getDefaultPermissionsForRole(
  roleName: UserRoleEnum,
  tx: any,
): Promise<{ id: string; name: string }[]> {
  // Simplified permissions for calendar system
  const rolePermissionMap: Record<string, string[]> = {
    [UserRoleEnum.OWNER]: [
      // Full organization control
      PERMISSIONS.READ_ORGANIZATION,
      PERMISSIONS.MANAGE_ORGANIZATION,
      PERMISSIONS.MANAGE_ROLES,
      PERMISSIONS.READ_MEMBERS,
      PERMISSIONS.MANAGE_MEMBERS,
      PERMISSIONS.INVITE_MEMBERS,
      PERMISSIONS.CREATE_MEETING,
      PERMISSIONS.READ_MEETING,
      PERMISSIONS.MANAGE_MEETING,
      PERMISSIONS.DELETE_MEETING,
      PERMISSIONS.READ_ALL_MEETINGS,
      PERMISSIONS.UPLOAD_RECORDING,
      PERMISSIONS.READ_TRANSCRIPT,
      PERMISSIONS.MANAGE_ACTION_ITEMS,
      PERMISSIONS.READ_AI_SUMMARY,
    ],

    [UserRoleEnum.ADMIN]: [
      // Organization management
      PERMISSIONS.READ_ORGANIZATION,
      PERMISSIONS.MANAGE_ORGANIZATION,
      PERMISSIONS.READ_MEMBERS,
      PERMISSIONS.MANAGE_MEMBERS,
      PERMISSIONS.INVITE_MEMBERS,
      PERMISSIONS.CREATE_MEETING,
      PERMISSIONS.READ_MEETING,
      PERMISSIONS.MANAGE_MEETING,
      PERMISSIONS.DELETE_MEETING,
      PERMISSIONS.READ_ALL_MEETINGS,
      PERMISSIONS.UPLOAD_RECORDING,
      PERMISSIONS.READ_TRANSCRIPT,
      PERMISSIONS.MANAGE_ACTION_ITEMS,
      PERMISSIONS.READ_AI_SUMMARY,
    ],

    [UserRoleEnum.MEMBER]: [
      // Basic member permissions
      PERMISSIONS.READ_ORGANIZATION,
      PERMISSIONS.READ_MEMBERS,
      PERMISSIONS.CREATE_MEETING,
      PERMISSIONS.READ_MEETING,
      PERMISSIONS.UPLOAD_RECORDING,
      PERMISSIONS.READ_TRANSCRIPT,
      PERMISSIONS.READ_AI_SUMMARY,
    ],
  };

  const permissionNames = rolePermissionMap[roleName.toString()] || [
    "READ_ORGANIZATION",
  ];

  const existingPermissions = await tx.permission.findMany({
    where: {
      name: { in: permissionNames },
      isActive: true,
    },
    select: { id: true, name: true },
  });

  const existingPermissionNames = existingPermissions.map(
    (p: Permission) => p.name,
  );
  const missingPermissionNames = permissionNames.filter(
    (name) => !existingPermissionNames.includes(name),
  );

  if (missingPermissionNames.length > 0) {
    console.log(
      `Creating ${missingPermissionNames.length} missing permissions for role ${roleName}:`,
      missingPermissionNames,
    );

    // Use createMany for better performance
    await tx.permission.createMany({
      data: missingPermissionNames.map((name) => ({
        name,
        module: getModuleForPermission(name),
        isActive: true,
      })),
      skipDuplicates: true,
    });

    // Fetch the newly created permissions
    const newPermissions = await tx.permission.findMany({
      where: {
        name: { in: missingPermissionNames },
        isActive: true,
      },
      select: { id: true, name: true },
    });

    return [...existingPermissions, ...newPermissions];
  }

  return existingPermissions;
}
