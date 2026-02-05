import { resolveOrgContext } from "./../middleware/resolveOrgContext";
import { Router } from "express";
import { organizationController } from "../controllers/organizationController";
import { verifyJWT } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/accessMiddleware";

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
  requirePermission("READ_ORGANIZATION"),
  organizationController.getOrganizationDetails,
);

// Update organization
organizationRouter.patch(
  "/",
  resolveOrgContext,
  requirePermission("MANAGE_ORGANIZATION"),
  organizationController.updateOrganization,
);

// Delete organization (owner only)
organizationRouter.delete(
  "/",
  resolveOrgContext,
  requirePermission("DELETE_ORGANIZATION"),
  organizationController.deleteOrganization,
);

// ================================
// MEMBERS
// ================================

// List organization members
organizationRouter.get(
  "/members",
  resolveOrgContext,
  requirePermission("READ_USER"),
  organizationController.getUsersInOrganization,
);

// Get single member
organizationRouter.get(
  "/members/:memberId",
  resolveOrgContext,
  requirePermission("READ_USER"),
  organizationController.getUserInOrganization,
);

// Remove member from organization
organizationRouter.delete(
  "/members/:memberId",
  resolveOrgContext,
  requirePermission("DELETE_USER"),
  organizationController.removeMember,
);

// Update member role
organizationRouter.patch(
  "/members/:memberId/role",
  resolveOrgContext,
  requirePermission("MANAGE_USER"),
  organizationController.updateMemberRole,
);

// ================================
// EMAIL CONFIG (Brevo)
// ================================

organizationRouter.get(
  "/email-config",
  resolveOrgContext,
  requirePermission("MANAGE_ORGANIZATION"),
  organizationController.getEmailConfig,
);

organizationRouter.put(
  "/email-config",
  resolveOrgContext,
  requirePermission("MANAGE_ORGANIZATION"),
  organizationController.updateEmailConfig,
);

export default organizationRouter;
