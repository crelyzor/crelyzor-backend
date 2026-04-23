import type { Request, Response } from "express";
import { apiResponse } from "../utils/globalResponseHandler";
import { getUserUsage, getLimitsForPlan } from "../services/billing/usageService";
import prisma from "../db/prismaClient";

/**
 * GET /billing/usage
 *
 * Returns the authenticated user's current plan, usage counters, limits, and
 * when the usage period resets. This is the primary feed for the Billing tab
 * in Settings and in-context indicators (upload modal, Ask AI panel, etc.).
 */
export const getBillingUsage = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const [user, usage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    }),
    getUserUsage(userId),
  ]);

  if (!user) {
    // Should never happen — verifyJWT already validates the user exists
    return apiResponse(res, { statusCode: 404, message: "User not found" });
  }

  const limits = getLimitsForPlan(user.plan);

  return apiResponse(res, {
    statusCode: 200,
    message: "Billing usage fetched",
    data: {
      plan: user.plan,
      usage: {
        transcriptionMinutes: usage.transcriptionMinutesUsed,
        recallHours: usage.recallHoursUsed,
        aiCredits: usage.aiCreditsUsed,
        storageGb: usage.storageGbUsed,
      },
      limits: {
        transcriptionMinutes: limits.transcriptionMinutes, // -1 = unlimited
        recallHours: limits.recallHours,
        aiCredits: limits.aiCredits,
        storageGb: limits.storageGb,
      },
      periodStart: usage.periodStart,
      resetAt: usage.resetAt,
    },
  });
};

/**
 * POST /billing/checkout
 *
 * ⛔ STUB — Payment gateway (Razorpay) is deferred.
 * Early Pro users are upgraded manually via Prisma Studio (user.plan = PRO).
 * This endpoint exists so the frontend can call it without breaking;
 * it returns a clear message explaining the situation.
 */
export const createCheckoutSession = async (req: Request, res: Response) => {
  return apiResponse(res, {
    statusCode: 200,
    message: "Payment gateway coming soon",
    data: {
      status: "deferred",
      message:
        "Online payments are not yet available. To upgrade to Pro, please contact support@crelyzor.com and we will upgrade your account manually.",
      supportEmail: "support@crelyzor.com",
    },
  });
};

/**
 * POST /billing/portal
 *
 * ⛔ STUB — Billing portal (manage subscription, invoices) is deferred.
 */
export const createBillingPortalSession = async (req: Request, res: Response) => {
  return apiResponse(res, {
    statusCode: 200,
    message: "Billing portal coming soon",
    data: {
      status: "deferred",
      message:
        "Billing portal is not yet available. For subscription changes, please contact support@crelyzor.com.",
      supportEmail: "support@crelyzor.com",
    },
  });
};
