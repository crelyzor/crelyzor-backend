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
  durationMinutes: z.number().int().min(5).max(480).optional(),
});

export const createStandaloneTaskSchema = createTaskSchema.extend({
  meetingId: z.string().uuid("Invalid meetingId").optional(),
  parentTaskId: z.string().uuid("Invalid parentTaskId").optional(),
  cardId: z.string().uuid("Invalid cardId").optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  transcriptContext: z.string().max(2000).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
  dueDate: dateField.nullable().optional(),
  scheduledTime: dateField.nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  cardId: z.string().uuid("Invalid cardId").nullable().optional(),
  transcriptContext: z.string().max(2000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480).nullable().optional(),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(["all", "completed", "pending"]).default("all"),
  view: z.enum(["inbox", "today", "upcoming", "all", "from_meetings"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  source: z.enum(["AI_EXTRACTED", "MANUAL"]).optional(),
  meetingId: z.string().uuid().optional(),
  cardId: z.string().uuid().optional(),
  hasMeeting: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  dueBefore: dateField.optional(),
  dueAfter: dateField.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(["createdAt", "dueDate", "priority", "sortOrder"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const reorderTasksSchema = z.object({
  taskIds: z
    .array(z.string().uuid("Each taskId must be a UUID"))
    .min(1)
    .max(100, "Cannot reorder more than 100 tasks at once"),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
