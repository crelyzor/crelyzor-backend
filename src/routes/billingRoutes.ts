import { Router } from "express";
import { verifyJWT } from "../middleware/authMiddleware";
import {
  getBillingUsage,
  createCheckoutSession,
  createBillingPortalSession,
} from "../controllers/billingController";

const billingRouter = Router();

// All billing endpoints require authentication
billingRouter.use(verifyJWT);

/**
 * GET /billing/usage
 * Returns plan, usage counters, limits, and reset date for the billing tab.
 */
billingRouter.get("/usage", getBillingUsage);

/**
 * POST /billing/checkout
 * Creates a checkout session. Stubbed until payment gateway is live.
 */
billingRouter.post("/checkout", createCheckoutSession);

/**
 * POST /billing/portal
 * Creates a billing portal session. Stubbed until payment gateway is live.
 */
billingRouter.post("/portal", createBillingPortalSession);

export default billingRouter;
