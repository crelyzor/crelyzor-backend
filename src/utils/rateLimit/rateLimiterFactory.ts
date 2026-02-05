import rateLimit from 'express-rate-limit';

export const createLimiter = (config: {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      success: false,
      message: config.message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    keyGenerator: (req) => req.ip || 'unknown',
  });
};

export default {
  createLimiter,
};
