import type { Request, Response, NextFunction } from "express";
import express from "express";
import cors from "cors";

import { corsOptions } from "./utils/security/corsOptions";
import { logger } from "./utils/logging/logger";
import { apiResponse } from "./utils/globalResponseHandler";
import recallWebhookRouter from "./routes/recallWebhookRoutes";

// Note: dotenv.config() is called in index.ts before app.ts is imported
const app = express();

app.use(cors(corsOptions));

// Webhook routes are registered BEFORE express.json() — each webhook route
// provides its own scoped express.json({ verify }) to capture rawBody only
// for the routes that need HMAC signature verification.
app.use("/webhooks", recallWebhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes

app.get("/", (_req: Request, res: Response) => {
  res.status(200).send("Auth Service is Live");
});
import indexRouter from "./routes/indexRouter";
app.use("/api/v1", indexRouter);

app.use((req: Request, res: Response) => {
  apiResponse(res, {
    statusCode: 404,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const err = error instanceof Error ? error : new Error(String(error));
  const status =
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
  logger.error("Unhandled error", {
    message: err.message,
    status,
    stack: err.stack,
    path: req.originalUrl,
  });
  apiResponse(res, {
    statusCode: status,
    message: err.message || "Internal server error",
  });
});

export default app;

// deployments
