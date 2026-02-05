import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";
import { roleController } from "../controllers/roleController";

const roleRouter = Router();

// All role routes require authentication and org context
roleRouter.use(verifyJWT);
roleRouter.use(resolveOrgContext);

/**
 * System Role Management
 * Only supports the 3 fixed system roles: OWNER, ADMIN, MEMBER
 * Admins can customize permissions for these roles but cannot create/delete roles
 */

// Get all system roles (OWNER, ADMIN, MEMBER)
roleRouter.get(
  "/",
  requirePermission("READ_ROLES_PERMISSIONS"),
  roleController.listRoles,
);

// Get a specific role by ID or name
roleRouter.get(
  "/:identifier",
  requirePermission("READ_ROLES_PERMISSIONS"),
  roleController.getRole,
);

// Add permissions to an existing system role
roleRouter.post(
  "/:roleId/permissions",
  requirePermission("MANAGE_ROLES_PERMISSIONS"),
  roleController.addPermissions,
);

// Remove permissions from an existing system role
roleRouter.delete(
  "/:roleId/permissions",
  requirePermission("MANAGE_ROLES_PERMISSIONS"),
  roleController.removePermissions,
);

// Sync (replace) role permissions
roleRouter.put(
  "/:roleId/permissions",
  requirePermission("MANAGE_ROLES_PERMISSIONS"),
  roleController.syncPermissions,
);

// Reset system role to default permissions
roleRouter.post(
  "/:roleId/reset",
  requirePermission("MANAGE_ROLES_PERMISSIONS"),
  roleController.resetToDefault,
);

export default roleRouter;
