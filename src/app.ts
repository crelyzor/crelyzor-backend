import type { Request, Response, NextFunction } from "express";
import express from "express";
import cors from "cors";

import { corsOptions } from "./utils/security/corsOptions";

// Note: dotenv.config() is called in index.ts before app.ts is imported
const app = express();

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes

app.get("/", (_req: Request, res: Response) => {
  res.status(200).send("Auth Service is Live");
});
import indexRouter from "./routes/indexRouter";
app.use("/api/v1", indexRouter);

app.use((req: Request, res: Response, next: NextFunction) => {
  const error: any = new Error(`Route ${req.originalUrl} not found`);
  error.status = 404;
  next(error);
});

app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  res.status(error.status || 500);
  res.json({
    error: {
      message: error.message,
      status: error.status || 500,
    },
  });
});

export default app;

// deployments
