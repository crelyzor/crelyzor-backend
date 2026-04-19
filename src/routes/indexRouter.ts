import { Router } from "express";
import authRouter from "./authRoutes";
import googleOAuthRouter from "./auth/googleOAuthRoutes";
import userRouter from "./userRoutes";
import storageRouter from "./storageRoutes";
import meetingRouter from "./meetingRoutes";
import smaRouter from "./smaRoutes";
import cardRouter from "./cardRoutes";
import publicCardRouter from "./publicCardRoutes";
import publicMeetingRouter from "./publicMeetingRoutes";
import tagRouter from "./tagRoutes";
import settingsRouter from "./settingsRoutes";
import schedulingRouter from "./schedulingRoutes";
import publicSchedulingRouter from "./publicSchedulingRoutes";
import publicBookingsRouter from "./publicBookingsRoutes";
import billingRouter from "./billingRoutes";
import integrationRouter from "./integrationRoutes";
import searchRouter from "./searchRoutes";
import googleWebhookRouter from "./googleWebhookRoutes";

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
// ⚙️ SETTINGS ROUTES
// ========================================
indexRouter.use("/settings", settingsRouter);

// ========================================
// 📅 SCHEDULING ROUTES
// ========================================
indexRouter.use("/scheduling", schedulingRouter);

// ========================================
// 📅 MEETING ROUTES
// ========================================
indexRouter.use("/meetings", meetingRouter);

// ========================================
// 💳 DIGITAL CARD ROUTES
// ========================================
indexRouter.use("/cards", cardRouter);

// ========================================
// 🌐 PUBLIC ROUTES
// ========================================
indexRouter.use("/public", publicCardRouter);
indexRouter.use("/public", publicMeetingRouter);
indexRouter.use("/public", publicSchedulingRouter);
indexRouter.use("/public", publicBookingsRouter);

// ========================================
// 🤖 SMA (Smart Meeting Assistant) ROUTES
// ========================================
indexRouter.use("/sma", smaRouter);

// ========================================
// 🏷️ TAG ROUTES
// ========================================
indexRouter.use("/tags", tagRouter);

// ========================================
// 🔗 INTEGRATION ROUTES
// ========================================
indexRouter.use("/integrations", integrationRouter);

// ========================================
// 💰 BILLING ROUTES
// ========================================
indexRouter.use("/billing", billingRouter);

// ========================================
// 🔍 SEARCH ROUTES
// ========================================
indexRouter.use("/search", searchRouter);

// ========================================
// 📦 STORAGE ROUTES
// ========================================
indexRouter.use("/storage", storageRouter);

// ========================================
// 🔔 WEBHOOK ROUTES (public — no JWT)
// ========================================
indexRouter.use("/webhooks", googleWebhookRouter);

export default indexRouter;
