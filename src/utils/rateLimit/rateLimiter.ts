import { createLimiter as createLimiterFactory } from './rateLimiterFactory';

// General API rate limiter
export const apiLimiter = createLimiterFactory({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = createLimiterFactory({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

// Rate limiter for creation endpoints
export const createResourceLimiter = createLimiterFactory({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: 'Too many creation requests, please try again later.',
});
