import { z } from "zod";

/**
 * Schema for updating profile page settings
 */
export const UpdateProfilePageSettingsSchema = z.object({
  isGenerateProfilePage: z.boolean().optional(),
  indiaSpecific: z.boolean().optional(),
});

export type UpdateProfilePageSettingsRequest = z.infer<
  typeof UpdateProfilePageSettingsSchema
>;
