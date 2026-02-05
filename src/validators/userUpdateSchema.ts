import z from "zod";

export const updateUserProfileSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be at most 100 characters long")
      .optional(),
    avatarUrl: z
      .string()
      .url("Invalid avatar URL")
      .optional()
      .or(z.literal("")),
    countryCode: z
      .string()
      .regex(/^\+\d{1,4}$/, "Invalid country code format")
      .optional()
      .or(z.literal("")),
    phoneNumber: z
      .string()
      .regex(/^\d{10,15}$/, "Phone number must be 10-15 digits")
      .optional()
      .or(z.literal("")),
    country: z
      .string()
      .min(1, "Country name is required")
      .max(100, "Country name must not exceed 100 characters")
      .optional()
      .or(z.literal("")),
    state: z
      .string()
      .min(1, "State name is required")
      .max(100, "State name must not exceed 100 characters")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) =>
      Object.keys(data).some(
        (key) => data[key as keyof typeof data] !== undefined,
      ),
    {
      message: "At least one field must be provided for update",
    },
  );

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
