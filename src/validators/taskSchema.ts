import { z } from "zod";

const dateField = z
  .string()
  .refine((d) => !isNaN(Date.parse(d)), "Invalid date")
  .transform((d) => new Date(d));

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().optional(),
  dueDate: dateField.optional(),
  scheduledTime: dateField.optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export const createStandaloneTaskSchema = createTaskSchema.extend({
  meetingId: z.string().uuid("Invalid meetingId").optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
  dueDate: dateField.nullable().optional(),
  scheduledTime: dateField.nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(["all", "completed", "pending"]).default("all"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  source: z.enum(["AI_EXTRACTED", "MANUAL"]).optional(),
  meetingId: z.string().uuid().optional(),
  hasMeeting: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  dueBefore: dateField.optional(),
  dueAfter: dateField.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(["createdAt", "dueDate", "priority"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
