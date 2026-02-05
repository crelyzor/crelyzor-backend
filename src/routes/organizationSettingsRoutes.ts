import { Router } from "express";
import {
  updateMeetingPreference,
  getMeetingPreference,
} from "../controllers/organizationSettingsController";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requireRole } from "../middleware/roleMiddleware";
import { UserRoleEnum } from "@prisma/client";

const organizationSettingsRoutes = Router();

organizationSettingsRoutes.get(
  "/meeting-preference",
  verifyJWT,
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  getMeetingPreference,
);

organizationSettingsRoutes.put(
  "/meeting-preference",
  verifyJWT,
  resolveOrgContext,
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  updateMeetingPreference,
);

export default organizationSettingsRoutes;
