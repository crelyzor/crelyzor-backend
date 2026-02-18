import { Router } from "express";
import authRouter from "./authRoutes";
import googleOAuthRouter from "./auth/googleOAuthRoutes";
import userRouter from "./userRoutes";
import googleCalendarRouter from "./integrations/googleCalendarRoutes";
import syncRouter from "./syncRoutes";
import storageRouter from "./storageRoutes";
import meetingRouter from "./meetingRoutes";
import availabilityRouter from "./availabilityRoutes";
import scheduleRouter from "./scheduleRoutes";
import eventTypeRouter from "./eventTypeRoutes";
import publicBookingRouter from "./publicBookingRoutes";
import smaRouter from "./smaRoutes";
import cardRouter from "./cardRoutes";
import publicCardRouter from "./publicCardRoutes";

const indexRouter = Router();

// ========================================
// 🔐 AUTHENTICATION ROUTES
// ========================================
// Google OAuth (public, no JWT) must be registered BEFORE auth routes
indexRouter.use("/auth/google", googleOAuthRouter);
indexRouter.use("/auth", authRouter);

// ========================================
// 👤 USER ROUTES
// ========================================
indexRouter.use("/users", userRouter);

// ========================================
// 🔗 INTEGRATION ROUTES
// ========================================
indexRouter.use("/integrations/calendar/sync", syncRouter);
indexRouter.use("/integrations/calendar", googleCalendarRouter);

// ========================================
// 📅 MEETING & AVAILABILITY ROUTES
// ========================================
indexRouter.use("/meetings", meetingRouter);
indexRouter.use("/schedules", scheduleRouter);
indexRouter.use("/event-types", eventTypeRouter);
indexRouter.use("/availability", availabilityRouter);

// ========================================
// 💳 DIGITAL CARD ROUTES
// ========================================
indexRouter.use("/cards", cardRouter);

// ========================================
// 🌐 PUBLIC ROUTES
// ========================================
indexRouter.use("/public", publicBookingRouter);
indexRouter.use("/public", publicCardRouter);

// ========================================
// 🤖 SMA (Smart Meeting Assistant) ROUTES
// ========================================
indexRouter.use("/sma", smaRouter);

// ========================================
// 📦 STORAGE ROUTES
// ========================================
indexRouter.use("/storage", storageRouter);

export default indexRouter;
