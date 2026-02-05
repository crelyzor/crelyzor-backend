import { Router } from "express";
import authRouter from "./authRoutes";
import organizationRouter from "./organizationRoutes";
import permissionRouter from "./permissionRoutes";
import inviteTokenRouter from "./inviteTokenRoutes";
import userRouter from "./userUpdateRoutes";
import roleRouter from "./roleRoutes";
import googleRouter from "./googleRoutes";
import storageRouter from "./storageRoutes";
import organizationSettingsRouter from "./organizationSettingsRoutes";
import meetingRouter from "./meetingRoutes";
import availabilityRouter from "./availabilityRoutes";
import syncRouter from "./syncRoutes";
import publicBookingRouter from "./publicBookingRoutes";
import recordingRouter from "./recordingRoutes";
import transcriptRouter from "./transcriptRoutes";
import aiRouter from "./aiRoutes";

const indexRouter = Router();

indexRouter.use("/auth", authRouter);
indexRouter.use("/organization", organizationRouter);
indexRouter.use("/permissions", permissionRouter);
indexRouter.use("/roles", roleRouter);
indexRouter.use("/invite-tokens", inviteTokenRouter);
indexRouter.use("/update-user", userRouter);
indexRouter.use("/google", googleRouter);
indexRouter.use("/storage", storageRouter);
indexRouter.use("/organization-settings", organizationSettingsRouter);
indexRouter.use("/meetings", meetingRouter);
indexRouter.use("/availability", availabilityRouter);
indexRouter.use("/sync", syncRouter);
indexRouter.use("/public", publicBookingRouter);

// SMA (Smart Meeting Assistant) routes
indexRouter.use("/sma", recordingRouter);
indexRouter.use("/sma", transcriptRouter);
indexRouter.use("/sma", aiRouter);

export default indexRouter;
