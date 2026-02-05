import { z } from "zod";

export const assignStudentSchema = z.object({
  studentMemberId: z
    .string({ message: "Student member ID is required" })
    .uuid("Student member ID must be a valid UUID"),
  assigneeMemberIds: z
    .array(z.string().uuid("Each assignee member ID must be a valid UUID"))
    .min(1, "At least one assignee member ID is required")
    .max(10, "Cannot assign more than 10 assignees to a student"),
});

export const unassignStudentSchema = z.object({
  studentMemberId: z
    .string({ message: "Student member ID is required" })
    .uuid("Student member ID must be a valid UUID"),
  assigneeMemberIds: z
    .array(z.string().uuid("Each assignee member ID must be a valid UUID"))
    .optional(),
});

export const getAssignmentsSchema = z.object({
  assigneeMemberId: z
    .string()
    .uuid("Assignee member ID must be a valid UUID")
    .optional(),
  studentMemberId: z
    .string()
    .uuid("Student member ID must be a valid UUID")
    .optional(),
  orgIds: z
    .array(z.string().uuid("Each org ID must be a valid UUID"))
    .optional(),
});

export const assignMultipleStudentsSchema = z.object({
  assigneeMemberId: z
    .string({ message: "Assignee member ID is required" })
    .uuid("Assignee member ID must be a valid UUID"),
  studentMemberIds: z
    .array(z.string().uuid("Each student member ID must be a valid UUID"))
    .min(1, "At least one student member ID is required")
    .max(50, "Cannot assign more than 50 students to one assignee at once"),
});
export const reassignStudentSchema = z.object({
  studentMemberId: z
    .string({ message: "Student member ID is required" })
    .uuid("Student member ID must be a valid UUID"),
  newAssigneeMemberId: z
    .string({ message: "New assignee member ID is required" })
    .uuid("New assignee member ID must be a valid UUID"),
});

export const unassignStudentsFromAssigneeSchema = z.object({
  assigneeMemberId: z
    .string({ message: "Assignee member ID is required" })
    .uuid("Assignee member ID must be a valid UUID"),
  studentMemberIds: z
    .array(z.string().uuid("Each student member ID must be a valid UUID"))
    .optional(),
});

export const getAssignedStudentsSchema = z
  .object({
    assigneeMemberId: z
      .string()
      .uuid("Assignee member ID must be a valid UUID")
      .optional(),
    orgIds: z
      .array(z.string().uuid("Each org ID must be a valid UUID"))
      .optional(),
  })
  .strict();

export const syncAssignmentsSchema = z.object({
  studentMemberId: z
    .string({ message: "Student member ID is required" })
    .uuid("Student member ID must be a valid UUID"),
  assigneeMemberIds: z
    .array(z.string().uuid("Each assignee member ID must be a valid UUID"))
    .max(10, "Cannot assign more than 10 assignees to a student"),
});

export const syncAssigneeAssignmentsSchema = z.object({
  studentMemberIds: z
    .array(z.string().uuid("Each student member ID must be a valid UUID"))
    .min(1, "At least one student member ID is required")
    .max(50, "Cannot sync more than 50 students at once"),
  assigneeMemberId: z
    .string({ message: "Assignee member ID is required" })
    .uuid("Assignee member ID must be a valid UUID"),
});

export type AssignStudentSchema = z.infer<typeof assignStudentSchema>;
export type UnassignStudentSchema = z.infer<typeof unassignStudentSchema>;
export type GetAssignmentsSchema = z.infer<typeof getAssignmentsSchema>;
export type AssignMultipleStudentsSchema = z.infer<
  typeof assignMultipleStudentsSchema
>;
export type UnassignStudentsFromAssigneeSchema = z.infer<
  typeof unassignStudentsFromAssigneeSchema
>;
export type GetAssignedStudentsSchema = z.infer<
  typeof getAssignedStudentsSchema
>;
export type SyncAssignmentsSchema = z.infer<typeof syncAssignmentsSchema>;
export type SyncAssigneeAssignmentsSchema = z.infer<
  typeof syncAssigneeAssignmentsSchema
>;
