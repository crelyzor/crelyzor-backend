import { z } from "zod";

/**
 * Schema for creating a new permission
 */
export const CreatePermissionSchema = z.object({
  name: z
    .string()
    .min(3, "Permission name must be at least 3 characters")
    .max(100, "Permission name must not exceed 100 characters")
    .regex(
      /^[A-Z_]+$/,
      "Permission name must be uppercase with underscores only (e.g., CREATE_USER)",
    ),
  isActive: z.boolean().optional().default(true),
});

/**
 * Schema for updating a permission
 */
export const UpdatePermissionSchema = z.object({
  name: z
    .string()
    .min(3, "Permission name must be at least 3 characters")
    .max(100, "Permission name must not exceed 100 characters")
    .regex(
      /^[A-Z_]+$/,
      "Permission name must be uppercase with underscores only",
    )
    .optional(),
  isActive: z.boolean().optional(),
});
