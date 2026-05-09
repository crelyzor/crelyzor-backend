import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must not exceed 128 characters");
// .refine(
//     (password) => {
//         const hasUpperCase = /[A-Z]/.test(password);
//         const hasLowerCase = /[a-z]/.test(password);
//         const hasNumbers = /\d/.test(password);
//         const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
//         return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
//     },
//     {
//         message:
//             "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
//     }
// );

interface RegisterSchema {
  email: string;
  password: string;
  confirmPassword: string;
  referralCode?: string;
}

export const registerSchema: z.ZodType<RegisterSchema> = z
  .object({
    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email must not exceed 255 characters")
      .toLowerCase()
      .trim(),
    password: passwordSchema,
    confirmPassword: passwordSchema,
    referralCode: z
      .string()
      .min(1, "Referral code must not be empty")
      .max(20, "Referral code must not exceed 20 characters")
      .optional(),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });
export type { RegisterSchema };
export const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email must not exceed 255 characters")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must not exceed 128 characters"),
  deviceInfo: z
    .string()
    .max(500, "Device info must not exceed 500 characters")
    .optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .max(1000, "Invalid refresh token format")
    .optional(),
});

export const resetPasswordSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email must not exceed 255 characters")
    .toLowerCase()
    .trim(),
});

export const confirmResetPasswordSchema = z.object({
  token: z
    .string()
    .min(1, "Reset token is required")
    .max(1000, "Invalid reset token format"),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required")
    .max(128, "Password must not exceed 128 characters"),
  newPassword: passwordSchema,
});

export const logoutSchema = z.object({
  refreshToken: z.string().max(1000, "Invalid refresh token format").optional(),
  logoutAll: z.boolean().optional().default(false),
});
