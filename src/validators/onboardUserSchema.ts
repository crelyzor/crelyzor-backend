import { z } from "zod";

export const onboardUserSchema = z.object({
  name: z.string().min(2),
  email: z
    .string()
    .email()
    .max(255, "Email must not exceed 255 characters")
    .toLowerCase()
    .trim(),
  countryCode: z.string().min(1).optional(),
  phoneNumber: z.string().min(10).max(15).optional(),
  country: z.string().min(2).optional(),
  state: z.string().min(2).optional(),
});

export type CreateUserInput = z.infer<typeof onboardUserSchema>;
