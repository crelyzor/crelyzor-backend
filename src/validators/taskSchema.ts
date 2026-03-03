import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().optional(),
  dueDate: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid due date")
    .transform((d) => new Date(d))
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
  dueDate: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), "Invalid due date")
    .transform((d) => new Date(d))
    .nullable()
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
