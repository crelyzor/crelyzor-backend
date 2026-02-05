import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";
import { permissionController } from "../controllers/permissionController";

const permissionRouter = Router();

// All routes require authentication
permissionRouter.use(verifyJWT);

/**
 * Permission CRUD Routes
 * Manage system-wide permissions (not role assignments)
 * For role management, use /api/v1/roles instead
 */

// Get current user's permissions
permissionRouter.get(
  "/me",
  resolveOrgContext,
  requirePermission("READ_ROLES_PERMISSIONS"),
  permissionController.getMyPermissions,
);

// Get all permissions
permissionRouter.get(
  "/",
  resolveOrgContext,
  requirePermission("READ_ROLES_PERMISSIONS"),
  permissionController.getAllPermissions,
);

// Get permission by ID
permissionRouter.get(
  "/:id",
  resolveOrgContext,
  requirePermission("READ_ROLES_PERMISSIONS"),
  permissionController.getPermissionById,
);

// Create new permission
permissionRouter.post(
  "/",
  resolveOrgContext,
  requirePermission("MANAGE_ROLES_PERMISSIONS"),
  permissionController.createPermission,
);

// Update permission
permissionRouter.put(
  "/:id",
  resolveOrgContext,
  requirePermission("MANAGE_ROLES_PERMISSIONS"),
  permissionController.updatePermission,
);

export default permissionRouter;
