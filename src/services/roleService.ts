import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { UserRoleEnum } from "@prisma/client";
import {
  PERMISSION_MODULES,
  getModuleForPermission,
} from "../constants/permissions";

// Types
export interface RoleDTO {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  systemRoleType: UserRoleEnum | null;
  orgId: string;
  isActive: boolean;
  userCount?: number;
  permissions: PermissionDTO[];
  grantedPermission?: PermissionDTO[];
  availablePermission?: PermissionDTO[];
  permissionsByModule?: PermissionsByModuleDTO;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionDTO {
  id: string;
  name: string;
  isActive: boolean;
  module?: string; // Permission category
  isGranted?: boolean; // Whether permission is granted to the role
}

export interface PermissionsByModuleDTO {
  [moduleName: string]: PermissionDTO[];
}

export const roleService = {
  /**
   * Get all roles in an organization (only system roles: OWNER, ADMIN, MEMBER)
   */
  async listRoles(orgId: string): Promise<RoleDTO[]> {
    try {
      const roles = await prisma.role.findMany({
        where: { orgId, isActive: true },
        include: {
          _count: {
            select: { userRoles: { where: { isActive: true } } },
          },
        },
        orderBy: [
          { isSystemRole: "desc" }, // System roles first
          { name: "asc" },
        ],
      });

      return roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystemRole: role.isSystemRole,
        systemRoleType: role.systemRoleType,
        orgId: role.orgId,
        isActive: role.isActive,
        userCount: role._count.userRoles,
        permissions: [],
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      }));
    } catch (error) {
      console.error("[RoleService.listRoles] Error:", error);
      throw ErrorFactory.dbOperation("Failed to fetch roles");
    }
  },

  /**
   * Get a specific role by ID or name
   */
  async getRole(
    orgId: string,
    identifier: string, // Can be role ID or role name
  ): Promise<RoleDTO | null> {
    try {
      // Check if identifier is UUID (role ID) or name
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identifier,
        );

      const role = await prisma.role.findFirst({
        where: {
          orgId,
          ...(isUUID ? { id: identifier } : { name: identifier }),
        },
        include: {
          permissions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          _count: {
            select: { userRoles: { where: { isActive: true } } },
          },
        },
      });

      if (!role) return null;

      // Fetch all available permissions
      const allPermissions = await prisma.permission.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });

      // Create a Set of granted permission IDs for efficient lookup
      const grantedPermissionIds = new Set(role.permissions.map((p) => p.id));

      // Map all permissions with isGranted flag
      const permissionsWithGrantStatus: PermissionDTO[] = allPermissions.map(
        (p: any) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
          module: p.module,
          isGranted: grantedPermissionIds.has(p.id),
        }),
      );

      return {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystemRole: role.isSystemRole,
        systemRoleType: role.systemRoleType,
        orgId: role.orgId,
        isActive: role.isActive,
        userCount: role._count.userRoles,
        grantedPermission: role.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        availablePermission: allPermissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        permissions: role.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        permissionsByModule: this.groupPermissionsByModule(
          permissionsWithGrantStatus,
        ),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      };
    } catch (error) {
      console.error("[RoleService.getRole] Error:", error);
      throw ErrorFactory.dbOperation("Failed to fetch role");
    }
  },

  /**
   * Get a role by name (simpler wrapper around getRole)
   */
  async getRoleByName(orgId: string, roleName: string): Promise<RoleDTO> {
    const role = await this.getRole(orgId, roleName);
    if (!role) {
      throw ErrorFactory.notFound(
        `Role "${roleName}" not found in organization`,
      );
    }
    return role;
  },

  /**
   * Add permissions to a role
   */
  async addPermissionsToRole(
    orgId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<RoleDTO> {
    try {
      const role = await prisma.role.findFirst({
        where: { id: roleId, orgId },
      });

      if (!role) {
        throw ErrorFactory.notFound("Role not found in this organization");
      }

      // Verify permission IDs exist
      const permissions = await prisma.permission.findMany({
        where: { id: { in: permissionIds } },
      });

      if (permissions.length !== permissionIds.length) {
        throw ErrorFactory.validation("One or more permission IDs are invalid");
      }

      const updated = await prisma.role.update({
        where: { id: roleId },
        data: {
          permissions: {
            connect: permissionIds.map((id) => ({ id })),
          },
        },
        include: {
          permissions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          _count: {
            select: { userRoles: { where: { isActive: true } } },
          },
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isSystemRole: updated.isSystemRole,
        systemRoleType: updated.systemRoleType,
        orgId: updated.orgId,
        isActive: updated.isActive,
        userCount: updated._count.userRoles,
        permissions: updated.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error: any) {
      console.error("[RoleService.addPermissionsToRole] Error:", error);
      if (error?.statusCode) throw error;
      throw ErrorFactory.dbOperation("Failed to add permissions to role");
    }
  },

  /**
   * Remove permissions from a role
   */
  async removePermissionsFromRole(
    orgId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<RoleDTO> {
    try {
      const role = await prisma.role.findFirst({
        where: { id: roleId, orgId },
      });

      if (!role) {
        throw ErrorFactory.notFound("Role not found in this organization");
      }

      const updated = await prisma.role.update({
        where: { id: roleId },
        data: {
          permissions: {
            disconnect: permissionIds.map((id) => ({ id })),
          },
        },
        include: {
          permissions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          _count: {
            select: { userRoles: { where: { isActive: true } } },
          },
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isSystemRole: updated.isSystemRole,
        systemRoleType: updated.systemRoleType,
        orgId: updated.orgId,
        isActive: updated.isActive,
        userCount: updated._count.userRoles,
        permissions: updated.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error: any) {
      console.error("[RoleService.removePermissionsFromRole] Error:", error);
      if (error?.statusCode) throw error;
      throw ErrorFactory.dbOperation("Failed to remove permissions from role");
    }
  },

  /**
   * Sync role permissions (replace all permissions)
   */
  async syncRolePermissions(
    orgId: string,
    roleId: string,
    permissionIds: string[],
  ): Promise<RoleDTO> {
    try {
      const role = await prisma.role.findFirst({
        where: { id: roleId, orgId },
        include: { permissions: true },
      });

      if (!role) {
        throw ErrorFactory.notFound("Role not found in this organization");
      }

      // Verify permission IDs exist
      if (permissionIds.length > 0) {
        const permissions = await prisma.permission.findMany({
          where: { id: { in: permissionIds } },
        });

        if (permissions.length !== permissionIds.length) {
          throw ErrorFactory.validation(
            "One or more permission IDs are invalid",
          );
        }
      }

      const currentPermissionIds = role.permissions.map((p) => p.id);

      const updated = await prisma.role.update({
        where: { id: roleId },
        data: {
          permissions: {
            disconnect: currentPermissionIds.map((id) => ({ id })),
            connect: permissionIds.map((id) => ({ id })),
          },
        },
        include: {
          permissions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          _count: {
            select: { userRoles: { where: { isActive: true } } },
          },
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isSystemRole: updated.isSystemRole,
        systemRoleType: updated.systemRoleType,
        orgId: updated.orgId,
        isActive: updated.isActive,
        userCount: updated._count.userRoles,
        permissions: updated.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error: any) {
      console.error("[RoleService.syncRolePermissions] Error:", error);
      if (error?.statusCode) throw error;
      throw ErrorFactory.dbOperation("Failed to sync role permissions");
    }
  },

  /**
   * Reset a system role to default permissions
   */
  async resetRoleToDefault(orgId: string, roleId: string): Promise<RoleDTO> {
    try {
      const role = await prisma.role.findFirst({
        where: { id: roleId, orgId },
      });

      if (!role) {
        throw ErrorFactory.notFound("Role not found in this organization");
      }

      if (!role.isSystemRole || !role.systemRoleType) {
        throw ErrorFactory.validation("Can only reset system roles to default");
      }

      // Get default permissions for this system role
      const { getDefaultPermissionsForRole } =
        await import("../utils/assignRoles");
      const defaultPermissions = await getDefaultPermissionsForRole(
        role.systemRoleType,
        prisma,
      );

      const currentPermissions = await prisma.role
        .findUnique({
          where: { id: roleId },
          include: { permissions: true },
        })
        .then((r) => r?.permissions || []);

      const currentPermissionIds = currentPermissions.map((p) => p.id);

      const updated = await prisma.role.update({
        where: { id: roleId },
        data: {
          permissions: {
            disconnect: currentPermissionIds.map((id) => ({ id })),
            connect: defaultPermissions.map((p) => ({ id: p.id })),
          },
        },
        include: {
          permissions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          _count: {
            select: { userRoles: { where: { isActive: true } } },
          },
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isSystemRole: updated.isSystemRole,
        systemRoleType: updated.systemRoleType,
        orgId: updated.orgId,
        isActive: updated.isActive,
        userCount: updated._count.userRoles,
        permissions: updated.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
        })),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error: any) {
      console.error("[RoleService.resetRoleToDefault] Error:", error);
      if (error?.statusCode) throw error;
      throw ErrorFactory.dbOperation("Failed to reset role to default");
    }
  },

  /**
   * Group permissions by module/category
   */
  groupPermissionsByModule(
    permissions: PermissionDTO[],
  ): PermissionsByModuleDTO {
    // Define module order based on PERMISSION_MODULES for consistent, logical presentation
    const moduleOrder = Object.keys(PERMISSION_MODULES);

    // First group permissions by module
    const groupedByModule = permissions.reduce((acc, permission) => {
      const module = permission.module || "Miscellaneous";
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(permission);
      return acc;
    }, {} as PermissionsByModuleDTO);

    // Then reorder according to moduleOrder, placing unknown modules at the end
    const result: PermissionsByModuleDTO = {};

    for (const module of moduleOrder) {
      if (groupedByModule[module]) {
        result[module] = groupedByModule[module];
      }
    }

    // Add any modules not in moduleOrder at the end
    for (const module in groupedByModule) {
      if (!result[module]) {
        result[module] = groupedByModule[module];
      }
    }

    return result;
  },

  /**
   * Get role with permissions by ID (Internal API for microservices)
   * Lightweight endpoint for other services to fetch role details
   */
  async getRoleWithPermissionsById(roleId: string) {
    try {
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: {
          id: true,
          name: true,
          systemRoleType: true,
          permissions: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!role) {
        throw ErrorFactory.notFound(`Role with ID ${roleId} not found`);
      }

      return {
        roleId: role.id,
        roleName: role.systemRoleType,
        name: role.name,
        permissions: role.permissions.map((p) => p.name),
        permissionDetails: role.permissions,
      };
    } catch (error: any) {
      console.error("[RoleService.getRoleWithPermissionsById] Error:", error);
      if (error?.statusCode) throw error;
      throw ErrorFactory.dbOperation("Failed to fetch role");
    }
  },

  /**
   * Get multiple roles with permissions by IDs (Internal API for microservices)
   * Useful when user has multiple roles across organizations
   */
  async getBatchRolesWithPermissions(roleIds: string[]) {
    try {
      const roles = await prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: {
          id: true,
          name: true,
          systemRoleType: true,
          permissions: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return roles.map((role) => ({
        roleId: role.id,
        roleName: role.systemRoleType,
        name: role.name,
        permissions: role.permissions.map((p) => p.name),
        permissionDetails: role.permissions,
      }));
    } catch (error: any) {
      console.error("[RoleService.getBatchRolesWithPermissions] Error:", error);
      throw ErrorFactory.dbOperation("Failed to fetch roles");
    }
  },
};
