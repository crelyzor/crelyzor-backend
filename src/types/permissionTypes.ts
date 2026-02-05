import { UserRoleEnum } from "@prisma/client";

/**
 * Permission DTO - represents a single permission
 */
export interface PermissionDTO {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * User's permissions response
 */
export interface UserPermissionsDTO {
  userId: string;
  orgMemberId: string;
  roleName: UserRoleEnum | null;
  rolePermissionId: string;
  permissions: PermissionDTO[];
}

/**
 * Request to create a new permission
 */
export interface CreatePermissionRequest {
  name: string;
  isActive?: boolean;
}

/**
 * Request to update a permission
 */
export interface UpdatePermissionRequest {
  name?: string;
  isActive?: boolean;
}

