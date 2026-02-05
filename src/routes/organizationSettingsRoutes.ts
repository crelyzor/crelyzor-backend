import { Router } from "express";
import {
  updateMeetingPreference,
  getMeetingPreference,
} from "../controllers/organizationSettingsController";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";

const organizationSettingsRoutes = Router();

organizationSettingsRoutes.get(
  "/meeting-preference",
  verifyJWT,
  resolveOrgContext,
  requirePermission("MANAGE_ORGANIZATION"),
  getMeetingPreference,
);

organizationSettingsRoutes.put(
  "/meeting-preference",
  verifyJWT,
  resolveOrgContext,
  requirePermission("MANAGE_ORGANIZATION"),
  updateMeetingPreference,
);

export default organizationSettingsRoutes;
