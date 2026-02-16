import { Request, Response } from "express";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  AddUserToOrganizationSchema,
  UpdateEmailConfigSchema,
} from "../validators/organizationSchema";
import { AuthenticatedUser } from "../types/authTypes";
import { registerOrganizationService } from "../services/organizationService";
import { orgPayload } from "../types/orgTypes";
import { UserRoleEnum } from "@prisma/client";
import { hasRole } from "../utils/roleUtils";

export const organizationController = {
  /**
   * @function createOrganization
   * @description Handles the creation of a new organization.
   * - Validates the request body against the `CreateOrganizationSchema`.
   * - Ensures the authenticated user is valid and authorized.
   * - Calls the `registerOrganizationService` to create the organization.
   * - Returns a success response with organization data on success.
   * - Throws appropriate errors if validation or database operations fail.
   */
  createOrganization: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      if (!user || !user?.userId) {
        throw ErrorFactory.unauthorized("unauthorized user");
      }

      const parsedData = CreateOrganizationSchema.safeParse(req.body);
      if (!parsedData?.success) {
        throw ErrorFactory.validation(parsedData?.error);
      }

      const organization = await registerOrganizationService.register(
        user?.userId,
        parsedData.data,
      );

      if (!organization) {
        throw ErrorFactory.dbOperation("failed to create organization");
      }

      apiResponse(res, {
        statusCode: 200,
        message: "organization created successfully",
        data: organization,
      });
    } catch (error) {
      console.error("[CreateOrganization] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  getOrganizationDetails: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user) {
        throw ErrorFactory.unauthorized("unauthorized user");
      }
      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("organization context missing");
      }

      const organizationDetails =
        await registerOrganizationService.getOrganizationById(org.orgId);
      if (!organizationDetails) {
        throw ErrorFactory.dbOperation("failed to get organization details");
      }
      apiResponse(res, {
        statusCode: 200,
        message: "organization details fetched successfully",
        data: organizationDetails,
      });
    } catch (error) {
      console.error("[GetOrganizationDetails] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  updateOrganization: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user) {
        throw ErrorFactory.unauthorized("unauthorized user");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      // Check if user is admin or owner
      const isAdminOrOwner = hasRole(org.accessLevel, UserRoleEnum.ADMIN);

      if (!isAdminOrOwner) {
        throw ErrorFactory.forbidden(
          "Only organization admins or owners can update organization details",
        );
      }

      const parsedData = UpdateOrganizationSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      // Check if at least one field is provided
      if (Object.keys(parsedData.data).length === 0) {
        throw ErrorFactory.validation("At least one field must be provided");
      }

      const updatedOrg = await registerOrganizationService.updateOrganization(
        org.orgId,
        parsedData.data,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Organization updated successfully",
        data: updatedOrg,
      });
    } catch (error) {
      console.error("[UpdateOrganization] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get all users in organization
   * Shows user details with roles and permissions
   * Supports search and filtering by roles and status
   */
  getUsersInOrganization: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user) {
        throw ErrorFactory.unauthorized("unauthorized user");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const { search, roles, page, limit } = req.query;

      const options: {
        search?: string;
        roleFilter?: UserRoleEnum;
        page?: number;
        limit?: number;
      } = {};
      if (search) options.search = search as string;
      if (roles) options.roleFilter = roles as UserRoleEnum;
      if (page) options.page = parseInt(page as string);
      if (limit) options.limit = parseInt(limit as string);

      const result = await registerOrganizationService.getOrganizationMembers(
        org.orgId,
        options,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Organization users retrieved successfully",
        data: result,
      });
    } catch (error) {
      console.error("[GetUsersInOrganization] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Add a new user to the organization
   * Creates user if doesn't exist and assigns specified role
   */
  addUserToOrganization: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user) {
        throw ErrorFactory.unauthorized("unauthorized user");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const parsedData = AddUserToOrganizationSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const { name, email, role } = parsedData.data;
      const roleEnum = role.name as UserRoleEnum;

      const newMember = await registerOrganizationService.addOrganizationMember(
        org.orgId,
        user.userId,
        {
          email,
          name,
          role: roleEnum,
        },
      );

      apiResponse(res, {
        statusCode: 201,
        message: "User added to organization successfully",
        data: newMember,
      });
    } catch (error) {
      console.error("[AddUserToOrganization] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get a specific user by ID in the organization
   * Returns user details with their roles and permissions
   */
  getUserInOrganization: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const { userId } = req.params;
      if (!userId) {
        throw ErrorFactory.validation("User ID is required");
      }

      const orgDetails = await registerOrganizationService.getOrganizationById(
        org.orgId,
        userId,
      );

      const member = orgDetails.members.find((m: { userId: string }) => m.userId === userId);
      if (!member) {
        throw ErrorFactory.notFound("User not found in organization");
      }

      apiResponse(res, {
        statusCode: 200,
        message: "User retrieved successfully",
        data: member,
      });
    } catch (error) {
      console.error("[GetUserInOrganization] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get organization's email configuration (Brevo settings)
   * Returns whether email is configured and the sender details
   */
  getEmailConfig: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const orgDetails = await registerOrganizationService.getOrganizationById(
        org.orgId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Email configuration retrieved successfully",
        data: {
          senderEmail: orgDetails.senderEmail || null,
          senderName: orgDetails.senderName || null,
          isConfigured: !!orgDetails.senderEmail,
        },
      });
    } catch (error) {
      console.error("[GetEmailConfig] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Update organization's email configuration (Brevo settings)
   * Allows admins to configure their own Brevo API key and sender info
   */
  updateEmailConfig: async (req: Request, res: Response): Promise<void> => {
    try {
      const org = req.org as orgPayload;
      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const parsedData = UpdateEmailConfigSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const updatedOrg = await registerOrganizationService.updateOrganization(
        org.orgId,
        {
          senderEmail: parsedData.data.senderEmail,
          senderName: parsedData.data.senderName,
        },
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Email configuration updated successfully",
        data: {
          senderEmail: updatedOrg.senderEmail || parsedData.data.senderEmail,
          senderName: updatedOrg.senderName || parsedData.data.senderName,
        },
      });
    } catch (error) {
      console.error("[UpdateEmailConfig] error: ", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Get all organizations for the current user
   */
  getUserOrganizations: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("Unauthorized access");
      }

      const organizations = await registerOrganizationService.getUserOrganizations(
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Organizations fetched successfully",
        data: organizations,
      });
    } catch (error) {
      console.error("[GetUserOrganizations] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Delete organization (owner only)
   */
  deleteOrganization: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("Unauthorized access");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const result = await registerOrganizationService.deleteOrganization(
        org.orgId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (error) {
      console.error("[DeleteOrganization] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Remove a member from the organization
   */
  removeMember: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("Unauthorized access");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const { memberId } = req.params;
      if (!memberId) {
        throw ErrorFactory.validation("Member ID is required");
      }

      const result = await registerOrganizationService.removeOrganizationMember(
        org.orgId,
        memberId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (error) {
      console.error("[RemoveMember] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Update a member's role
   */
  updateMemberRole: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("Unauthorized access");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const { memberId } = req.params;
      const { role } = req.body;

      if (!memberId) {
        throw ErrorFactory.validation("Member ID is required");
      }

      if (!role) {
        throw ErrorFactory.validation("Role is required");
      }

      const result = await registerOrganizationService.updateMemberRole(
        org.orgId,
        memberId,
        role as UserRoleEnum,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (error) {
      console.error("[UpdateMemberRole] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  /**
   * Transfer organization ownership
   */
  transferOwnership: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user as AuthenticatedUser;
      const org = req.org as orgPayload;

      if (!user || !user.userId) {
        throw ErrorFactory.unauthorized("Unauthorized access");
      }

      if (!org || !org.orgId) {
        throw ErrorFactory.forbidden("Organization context is missing");
      }

      const { newOwnerId } = req.body;
      if (!newOwnerId) {
        throw ErrorFactory.validation("New owner ID is required");
      }

      const result = await registerOrganizationService.transferOwnership(
        org.orgId,
        user.userId,
        newOwnerId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (error) {
      console.error("[TransferOwnership] error:", error);
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
