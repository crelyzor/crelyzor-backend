import { z } from "zod";

export const createMeetingSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must be less than 255 characters"),
    description: z.string().optional(),
    startTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid start time")
      .transform((date) => new Date(date)),
    endTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid end time")
      .transform((date) => new Date(date)),
    timezone: z.string().default("UTC"),
    mode: z.enum(["ONLINE", "IN_PERSON"]),
    location: z.string().optional(),
    participantMemberIds: z
      .array(z.string().uuid("Invalid participant ID format"))
      .optional(),
    guestEmails: z.array(z.string().email("Invalid email format")).optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  })
  .refine(
    (data) =>
      (data.participantMemberIds && data.participantMemberIds.length > 0) ||
      (data.guestEmails && data.guestEmails.length > 0),
    {
      message:
        "At least one participant (org member or external guest) is required",
      path: ["participantMemberIds"],
    },
  );

/**
 * Schema for requesting a meeting
 * Simplified version for calendar system
 */
export const requestMeetingSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must be less than 255 characters"),
    description: z.string().optional(),
    startTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid start time")
      .transform((date) => new Date(date)),
    endTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid end time")
      .transform((date) => new Date(date)),
    timezone: z.string().default("UTC"),
    mode: z.enum(["ONLINE", "IN_PERSON"]),
    location: z.string().optional(),
    participantMemberIds: z
      .array(z.string().uuid("Invalid participant ID format"))
      .optional(),
    orgMemberId: z.string().uuid("Invalid member ID format").optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  });

// For accept/decline/cancel endpoints - reason is optional
export const meetingActionSchema = z.object({
  reason: z.string().optional(),
});

// For legacy support - not used in new endpoints
export const updateMeetingStatusSchema = z.object({
  newStatus: z.enum([
    "PENDING_ACCEPTANCE",
    "ACCEPTED",
    "DECLINED",
    "COMPLETED",
    "CANCELLED",
    "RESCHEDULING_REQUESTED",
  ]),
  reason: z.string().optional(),
});

export const proposeMeetingRescheduleSchema = z
  .object({
    proposedStartTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid proposed start time")
      .transform((date) => new Date(date)),
    proposedEndTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid proposed end time")
      .transform((date) => new Date(date)),
    reason: z.string().optional(),
  })
  .refine((data) => data.proposedStartTime < data.proposedEndTime, {
    message: "Proposed start time must be before end time",
    path: ["proposedEndTime"],
  });

export const respondToRescheduleSchema = z.object({
  accepted: z.boolean(),
  responseNotes: z.string().optional(),
});

export const getMeetingsSchema = z.object({
  status: z
    .enum([
      "PENDING_ACCEPTANCE",
      "ACCEPTED",
      "DECLINED",
      "COMPLETED",
      "CANCELLED",
      "RESCHEDULING_REQUESTED",
    ])
    .optional(),
  startDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid start date")
    .transform((date) => (date ? new Date(date) : undefined)),
  endDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid end date")
    .transform((date) => (date ? new Date(date) : undefined)),
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const getMeetingsWithoutPaginationSchema = z.object({
  status: z
    .enum([
      "PENDING_ACCEPTANCE",
      "ACCEPTED",
      "DECLINED",
      "COMPLETED",
      "CANCELLED",
      "RESCHEDULING_REQUESTED",
    ])
    .optional(),
  startDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid start date")
    .transform((date) => (date ? new Date(date) : undefined)),
  endDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), "Invalid end date")
    .transform((date) => (date ? new Date(date) : undefined)),
});

export const updateMeetingSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must be less than 255 characters")
      .optional(),
    description: z.string().optional(),
    startTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid start time")
      .transform((date) => new Date(date))
      .optional(),
    endTime: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), "Invalid end time")
      .transform((date) => new Date(date))
      .optional(),
    timezone: z.string().optional(),
    mode: z.enum(["ONLINE", "IN_PERSON"]).optional(),
    location: z.string().optional(),
    participantMemberIds: z
      .array(z.string().uuid("Invalid participant ID format"))
      .optional(),
    guestEmails: z.array(z.string().email("Invalid email format")).optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
      }
      return true;
    },
    {
      message: "Start time must be before end time",
      path: ["endTime"],
    },
  );

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type RequestMeetingInput = z.infer<typeof requestMeetingSchema>;
export type UpdateMeetingStatusInput = z.infer<
  typeof updateMeetingStatusSchema
>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type ProposeMeetingRescheduleInput = z.infer<
  typeof proposeMeetingRescheduleSchema
>;
export type RespondToRescheduleInput = z.infer<
  typeof respondToRescheduleSchema
>;
export type GetMeetingsInput = z.infer<typeof getMeetingsSchema>;
