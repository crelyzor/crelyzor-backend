import { Request, Response } from "express";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { permissionService } from "../services/permissionService";
import {
  CreatePermissionSchema,
  UpdatePermissionSchema,
} from "../validators/permissionSchema";
import { orgPayload } from "../types/orgTypes";

export const permissionController = {
  /**
   * Get all permissions
   * GET /api/v1/permissions
   */
  getAllPermissions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { isActive } = req.query;
      const activeFilter =
        isActive === "true" ? true : isActive === "false" ? false : undefined;

      const permissions =
        await permissionService.getAllPermissions(activeFilter);

      apiResponse(res, {
        statusCode: 200,
        message: "Permissions retrieved successfully",
        data: permissions,
      });
    } catch (error) {
      console.error("[GetAllPermissions] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get permission by ID
   * GET /api/v1/permissions/:id
   */
  getPermissionById: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const permission = await permissionService.getPermissionById(id);

      apiResponse(res, {
        statusCode: 200,
        message: "Permission retrieved successfully",
        data: permission,
      });
    } catch (error) {
      console.error("[GetPermissionById] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Create a new permission
   * POST /api/v1/permissions
   */
  createPermission: async (req: Request, res: Response): Promise<void> => {
    try {
      const parsedData = CreatePermissionSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const permission = await permissionService.createPermission(
        parsedData.data,
      );

      apiResponse(res, {
        statusCode: 201,
        message: "Permission created successfully",
        data: permission,
      });
    } catch (error) {
      console.error("[CreatePermission] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Update a permission
   * PUT /api/v1/permissions/:id
   */
  updatePermission: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const parsedData = UpdatePermissionSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const permission = await permissionService.updatePermission(
        id,
        parsedData.data,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Permission updated successfully",
        data: permission,
      });
    } catch (error) {
      console.error("[UpdatePermission] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get current user's permissions
   * GET /api/v1/permissions/me
   */
  getMyPermissions: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;

      if (!org || !org.orgId) {
        throw ErrorFactory.validation("Organization context missing");
      }

      // Get current user ID from JWT
      const userId = req.user?.userId;
      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      // Get orgMemberId from org context
      const userOrgRole = org.orgRoles.find((role) => role.orgMemberId);
      if (!userOrgRole) {
        throw ErrorFactory.notFound(
          "User is not a member of this organization",
        );
      }

      const permissions = await permissionService.getUserPermissions(
        userId,
        userOrgRole.orgMemberId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "User permissions retrieved successfully",
        data: permissions,
      });
    } catch (error) {
      console.error("[GetMyPermissions] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
