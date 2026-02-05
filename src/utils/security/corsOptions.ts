import { CorsOptions } from 'cors';

const allowedOrigins = [
  'https://crm-frontend-eight-pink.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://crm-backend-v2.vercel.app',
  'https://crm-backend-rouge.vercel.app',
  'https://www.experimentlabs.in',
  'https://experimentlabs.in',
  'https://lalalala-five.vercel.app',
  'https://meeting-crm-test.vercel.app',
  'https://crm-preprod.vercel.app',
  'https://evaluator-v2.vercel.app',
  'https://elivio.experimentlabs.in',
  'https://elivio.experimentlabs.in/',
  'https://evaluator-staging.vercel.app',
  'https://evaluator-staging.vercel.app/',
  'https://sma-backend-orpin.vercel.app',
];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-organization-id',
    'Accept',
    'Origin',
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
