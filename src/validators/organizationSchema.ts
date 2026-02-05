import { z } from "zod";

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  description: z.string().optional(),
  organizationDetails: z.object({
    industry: z.string().optional(),
    size: z.string().optional(),
    website: z.string().url().optional().or(z.literal("")),
  }).optional(),
  orgLogoUrl: z.string().url("Invalid logo URL").optional().or(z.literal("")),
});

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").optional(),
  description: z.string().optional(),
  organizationDetails: z
    .object({
      industry: z.string().optional(),
      size: z.string().optional(),
      website: z.string().url().optional().or(z.literal("")),
    })
    .optional(),
  orgLogoUrl: z.string().url("Invalid logo URL").optional().or(z.literal("")),
  brandColor: z.string().optional(),
  senderEmail: z.string().email().optional(),
  senderName: z.string().optional(),
});

export const AddUserToOrganizationSchema = z.object({
  name: z.string().min(1, "User name is required"),
  email: z.string().email("Valid email is required"),
  role: z.object({
    type: z.enum(["system", "custom"], {
      message: "Role type must be either 'system' or 'custom'",
    }),
    name: z.string().min(1, "Role name is required"),
  }),
});

export type UpdateOrganizationRequest = z.infer<
  typeof UpdateOrganizationSchema
>;

export type AddUserToOrganizationRequest = z.infer<
  typeof AddUserToOrganizationSchema
>;

// Email configuration schemas
export const UpdateEmailConfigSchema = z.object({
  brevoApiKey: z.string().min(1, "Brevo API key is required"),
  senderEmail: z.string().email("Valid sender email is required"),
  senderName: z.string().min(1, "Sender name is required"),
});

export type UpdateEmailConfigRequest = z.infer<typeof UpdateEmailConfigSchema>;
