import { Router } from "express";
import authRouter from "./authRoutes";
import googleOAuthRouter from "./auth/googleOAuthRoutes";
import organizationRouter from "./organizationRoutes";
import organizationSettingsRouter from "./organizationSettingsRoutes";
import inviteTokenRouter from "./inviteTokenRoutes";
import userRouter from "./userRoutes";
import googleCalendarRouter from "./integrations/googleCalendarRoutes";
import syncRouter from "./syncRoutes";
import storageRouter from "./storageRoutes";
import meetingRouter from "./meetingRoutes";
import availabilityRouter from "./availabilityRoutes";
import publicBookingRouter from "./publicBookingRoutes";
import smaRouter from "./smaRoutes";

const indexRouter = Router();

// ========================================
// 🔐 AUTHENTICATION ROUTES
// ========================================
indexRouter.use("/auth", authRouter);
indexRouter.use("/auth/google", googleOAuthRouter);

// ========================================
// 🏢 ORGANIZATION ROUTES
// ========================================
indexRouter.use("/organizations", organizationRouter);
indexRouter.use("/organizations/settings", organizationSettingsRouter);
indexRouter.use("/organizations/invite-tokens", inviteTokenRouter);

// ========================================
// 👤 USER ROUTES
// ========================================
indexRouter.use("/users", userRouter);

// ========================================
// 🔗 INTEGRATION ROUTES
// ========================================
indexRouter.use("/integrations/calendar", googleCalendarRouter);
indexRouter.use("/integrations/calendar/sync", syncRouter);

// ========================================
// 📅 MEETING & AVAILABILITY ROUTES
// ========================================
indexRouter.use("/meetings", meetingRouter);
indexRouter.use("/availability", availabilityRouter);

// ========================================
// 🌐 PUBLIC ROUTES
// ========================================
indexRouter.use("/public", publicBookingRouter);

// ========================================
// 🤖 SMA (Smart Meeting Assistant) ROUTES
// ========================================
indexRouter.use("/sma", smaRouter);

// ========================================
// 📦 STORAGE ROUTES
// ========================================
indexRouter.use("/storage", storageRouter);

export default indexRouter;
