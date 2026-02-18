import { CorsOptions } from "cors";

const allowedOrigins = [
  "https://crm-frontend-eight-pink.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://192.168.1.24:5174",
  "http://localhost:3000",
];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
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
