import { z } from "zod";

const urlPattern =
  /^https?:\/\/(www\.)?((localhost(:\d+)?)|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?)|([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6})(:\d+)?(\/[-a-zA-Z0-9()@:%_\+.~#?&//=]*)?$/;

export const shortenUrlSchema = z.object({
  originalUrl: z
    .string()
    .min(1, "URL is required")
    .max(2048, "URL too long")
    .refine((url) => urlPattern.test(url), {
      message: "Invalid URL format. Please provide a valid HTTP or HTTPS URL",
    }),
});

export const shortCodeParamSchema = z.object({
  shortCode: z
    .string()
    .min(1, "Short code is required")
    .max(20, "Short code too long")
    .regex(
      /^[a-z0-9]+$/,
      "Short code must contain only lowercase letters and numbers",
    ),
});
