import type { Request, Response, NextFunction } from "express";
import express from "express";
import cors from "cors";

// Note: dotenv.config() is called in index.ts before app.ts is imported
const app = express();

const allowedOrigins = [
  "https://crm-frontend-eight-pink.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://crm-backend-v2.vercel.app",
  "https://crm-backend-rouge.vercel.app",
  "https://www.experimentlabs.in",
  "https://experimentlabs.in",
  "https://lalalala-five.vercel.app",
  "https://crm-preprod.vercel.app",
  "https://evaluator-v2.vercel.app",
  "https://elivio.experimentlabs.in",
  "https://elivio.experimentlabs.in/",
  "https://evaluator-staging.vercel.app",
  "https://evaluator-staging.vercel.app/",
  "https://meeting-crm-test.vercel.app",
];
const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "x-organization-id",
    "Accept",
    "Origin",
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes

app.get("/", (req: Request, res: Response) => {
  console.log("Root route hit");
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
