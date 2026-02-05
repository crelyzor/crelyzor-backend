import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { getModuleForPermission } from "../constants/permissions";
import {
  PermissionDTO,
  UserPermissionsDTO,
  CreatePermissionRequest,
  UpdatePermissionRequest,
} from "../types/permissionTypes";

export const permissionService = {
  /**
   * Get all permissions in the system
   */
  async getAllPermissions(isActive?: boolean): Promise<PermissionDTO[]> {
    const permissions = await prisma.permission.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      orderBy: { name: "asc" },
    });

    return permissions.map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.isActive,
    }));
  },

  /**
   * Get a specific permission by ID
   */
  async getPermissionById(permissionId: string): Promise<PermissionDTO> {
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      throw ErrorFactory.notFound(
        `Permission with ID ${permissionId} not found`,
      );
    }

    return {
      id: permission.id,
      name: permission.name,
      isActive: permission.isActive,
    };
  },

  /**
   * Create a new permission
   * Automatically assigns module from PERMISSION_MODULES_MAP if available
   */
  async createPermission(
    data: CreatePermissionRequest,
  ): Promise<PermissionDTO> {
    // Check if permission already exists
    const existing = await prisma.permission.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw ErrorFactory.validation(
        `Permission with name "${data.name}" already exists`,
      );
    }

    // Get module using the permission modules helper
    const module = getModuleForPermission(data.name);

    const permission = await prisma.permission.create({
      data: {
        name: data.name,
        module: module,
        isActive: data.isActive ?? true,
      },
    });

    return {
      id: permission.id,
      name: permission.name,
      isActive: permission.isActive,
    };
  },

  /**
   * Update an existing permission
   */
  async updatePermission(
    permissionId: string,
    data: UpdatePermissionRequest,
  ): Promise<PermissionDTO> {
    const existing = await prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!existing) {
      throw ErrorFactory.notFound(
        `Permission with ID ${permissionId} not found`,
      );
    }

    // If updating name, check it's not a duplicate
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.permission.findUnique({
        where: { name: data.name },
      });

      if (duplicate) {
        throw ErrorFactory.validation(
          `Permission with name "${data.name}" already exists`,
        );
      }
    }

    const permission = await prisma.permission.update({
      where: { id: permissionId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return {
      id: permission.id,
      name: permission.name,
      isActive: permission.isActive,
    };
  },

  /**
   * Get user's permissions in an organization
   * Simplified - just returns permissions from the user's role
   */
  async getUserPermissions(
    userId: string,
    orgMemberId: string,
  ): Promise<UserPermissionsDTO> {
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId,
        orgMemberId,
        isActive: true,
      },
      include: {
        role: {
          include: {
            permissions: {
              where: { isActive: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
    });

    if (!userRole || !userRole.role) {
      throw ErrorFactory.notFound(
        `No active role found for user ${userId} in organization member ${orgMemberId}`,
      );
    }

    return {
      userId,
      orgMemberId,
      roleName: userRole.role.systemRoleType,
      rolePermissionId: userRole.roleId, // Now points to Role ID
      permissions: userRole.role.permissions.map((p) => ({
        id: p.id,
        name: p.name,
        isActive: p.isActive,
      })),
    };
  },
};
