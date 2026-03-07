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

// ========================================
// 🤖 SMA (Smart Meeting Assistant) ROUTES
// ========================================
indexRouter.use("/sma", smaRouter);

// ========================================
// 🏷️ TAG ROUTES
// ========================================
indexRouter.use("/tags", tagRouter);

// ========================================
// 📦 STORAGE ROUTES
// ========================================
indexRouter.use("/storage", storageRouter);

export default indexRouter;
