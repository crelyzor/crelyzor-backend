import z from "zod";

const softDeleteUserSchema = z.object({
  targetUserId: z.string().uuid("Target user ID must be a valid UUID"),
});

const restoreUserSchema = z.object({
  targetUserId: z.string().uuid("Target user ID must be a valid UUID"),
});

const triggerHardDeleteSchema = z.object({
  daysThreshold: z
    .number()
    .min(1, "Days threshold must be at least 1")
    .max(365, "Days threshold cannot exceed 365"),
});

const permanentDeleteUserSchema = z.object({
  targetUserId: z.string().uuid("Target user ID must be a valid UUID"),
});

export {
  softDeleteUserSchema,
  restoreUserSchema,
  triggerHardDeleteSchema,
  permanentDeleteUserSchema,
};
