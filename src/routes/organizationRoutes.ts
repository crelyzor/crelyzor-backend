import { resolveOrgContext } from "./../middleware/resolveOrgContext";
import { Router } from "express";
import { organizationController } from "../controllers/organizationController";
import { verifyJWT } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/roleMiddleware";
import { UserRoleEnum } from "@prisma/client";

const organizationRouter = Router();

organizationRouter.use(verifyJWT);

// ================================
// ORGANIZATION CRUD
// ================================

// Create team organization
organizationRouter.post("/", organizationController.createOrganization);

// Get all organizations for current user (personal + teams)
organizationRouter.get("/list", organizationController.getUserOrganizations);

// Get organization details (requires orgId header)
organizationRouter.get(
  "/",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  organizationController.getOrganizationDetails,
);

// Update organization
organizationRouter.patch(
  "/",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  organizationController.updateOrganization,
);

// Delete organization (owner only)
organizationRouter.delete(
  "/",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER]),
  organizationController.deleteOrganization,
);

// ================================
// MEMBERS
// ================================

// List organization members
organizationRouter.get(
  "/members",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  organizationController.getUsersInOrganization,
);

// Get single member
organizationRouter.get(
  "/members/:memberId",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  organizationController.getUserInOrganization,
);

// Remove member from organization
organizationRouter.delete(
  "/members/:memberId",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  organizationController.removeMember,
);

// Update member role
organizationRouter.patch(
  "/members/:memberId/role",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  organizationController.updateMemberRole,
);

// ================================
// EMAIL CONFIG (Brevo)
// ================================

organizationRouter.get(
  "/email-config",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  organizationController.getEmailConfig,
);

organizationRouter.put(
  "/email-config",
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  organizationController.updateEmailConfig,
);

export default organizationRouter;
