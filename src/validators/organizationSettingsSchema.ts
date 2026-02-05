import { z } from "zod";
import { ProviderEnum } from "@prisma/client";

export const updateMeetingPreferenceSchema = z.object({
  meetingPreference: z.nativeEnum(ProviderEnum, {
    message: "meetingPreference must be either GOOGLE or ZOOM",
  }),
});

export type UpdateMeetingPreferenceSchema = z.infer<
  typeof updateMeetingPreferenceSchema
>;
