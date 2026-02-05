import { Request, Response } from "express";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { roleService } from "../services/roleService";
import { orgPayload } from "../types/orgTypes";

export const roleController = {
  /**
   * Get all roles in organization (only system roles: OWNER, ADMIN, MEMBER)
   * GET /api/v1/roles
   */
  listRoles: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const roles = await roleService.listRoles(org.orgId);

      apiResponse(res, {
        statusCode: 200,
        message: "Roles retrieved successfully",
        data: { roles },
      });
    } catch (error) {
      console.error("[ListRoles] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get a specific role by ID or name
   * GET /api/v1/roles/:identifier
   */
  getRole: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      // Support both 'identifier' and 'roleName' params for backward compatibility
      const identifier = req.params.identifier || req.params.roleName;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      if (!identifier) {
        throw ErrorFactory.validation("Role identifier is required");
      }

      const role = await roleService.getRole(org.orgId, identifier);

      if (!role) {
        apiResponse(res, {
          statusCode: 404,
          message: `Role not found: ${identifier}`,
          data: null,
        });
        return;
      }

      apiResponse(res, {
        statusCode: 200,
        message: "Role retrieved successfully",
        data: {
          permissionsByModule: role.permissionsByModule,
        },
      });
    } catch (error) {
      console.error("[GetRole] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Add permissions to a role
   * POST /api/v1/roles/:roleId/permissions
   */
  addPermissions: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      const { permissionIds, roleName } = req.body;
      let roleIdentifier = req.params.roleId || req.params.roleName || roleName;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      if (!roleIdentifier) {
        throw ErrorFactory.validation("Role identifier is required");
      }

      if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
        throw ErrorFactory.validation("Permission IDs array is required");
      }

      // If roleIdentifier is not a UUID, look up the role by name
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let roleId = roleIdentifier;

      if (!uuidRegex.test(roleIdentifier)) {
        // It's a role name, look it up
        const foundRole = await roleService.getRoleByName(
          org.orgId,
          roleIdentifier,
        );
        roleId = foundRole.id;
      }

      const role = await roleService.addPermissionsToRole(
        org.orgId,
        roleId,
        permissionIds,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Permissions added to role successfully",
        data: role,
      });
    } catch (error) {
      console.error("[AddPermissionsToRole] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Remove permissions from a role
   * DELETE /api/v1/roles/:roleId/permissions
   */
  removePermissions: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      const { permissionIds, roleName } = req.body;
      let roleIdentifier = req.params.roleId || req.params.roleName || roleName;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      if (!roleIdentifier) {
        throw ErrorFactory.validation("Role identifier is required");
      }

      if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
        throw ErrorFactory.validation("Permission IDs array is required");
      }

      // If roleIdentifier is not a UUID, look up the role by name
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let roleId = roleIdentifier;

      if (!uuidRegex.test(roleIdentifier)) {
        // It's a role name, look it up
        const foundRole = await roleService.getRoleByName(
          org.orgId,
          roleIdentifier,
        );
        roleId = foundRole.id;
      }

      const role = await roleService.removePermissionsFromRole(
        org.orgId,
        roleId,
        permissionIds,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Permissions removed from role successfully",
        data: role,
      });
    } catch (error) {
      console.error("[RemovePermissionsFromRole] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Sync (replace) role permissions
   * PUT /api/v1/roles/:roleId/permissions
   */
  syncPermissions: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      const { roleId } = req.params;
      const { permissionIds } = req.body;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      if (!roleId) {
        throw ErrorFactory.validation("Role ID is required");
      }

      if (!Array.isArray(permissionIds)) {
        throw ErrorFactory.validation("Permission IDs must be an array");
      }

      const role = await roleService.syncRolePermissions(
        org.orgId,
        roleId,
        permissionIds,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Role permissions synced successfully",
        data: role,
      });
    } catch (error) {
      console.error("[SyncRolePermissions] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Reset a system role to default permissions
   * POST /api/v1/roles/:roleId/reset
   */
  resetToDefault: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      // Support both 'roleId' and 'roleName' params for backward compatibility
      let roleIdentifier = req.params.roleId || req.params.roleName;

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      if (!roleIdentifier) {
        throw ErrorFactory.validation("Role identifier is required");
      }

      // If roleIdentifier is not a UUID, look up the role by name
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let roleId = roleIdentifier;

      if (!uuidRegex.test(roleIdentifier)) {
        // It's a role name, look it up
        const foundRole = await roleService.getRoleByName(
          org.orgId,
          roleIdentifier,
        );
        roleId = foundRole.id;
      }

      const role = await roleService.resetRoleToDefault(org.orgId, roleId);

      apiResponse(res, {
        statusCode: 200,
        message: "Role reset to default permissions successfully",
        data: role,
      });
    } catch (error) {
      console.error("[ResetRoleToDefault] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
