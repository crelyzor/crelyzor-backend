import { z } from "zod";

// Zod enums matching Prisma enums
const EducationLevelEnum = z.enum(["SCHOOL", "GRADUATE", "POSTGRADUATE"]);

const GradeEnum = z.enum([
  "CLASS_9",
  "CLASS_10",
  "CLASS_11",
  "CLASS_12",
  "YEAR_1",
  "YEAR_2",
  "YEAR_3",
  "YEAR_4",
  "YEAR_5",
  "PASSOUT",
]);

const UserRoleEnumSchema = z.enum([
  "ADMIN",
  "CONSULTANT",
  "STUDENT",
  "MENTOR",
  "TEAM_MEMBER",
]);

/**
 * Schema for creating a new pre-student
 * Validates:
 * - Name, education level, current grade, and target countries are required
 * - At least 3 academic interests and 3 personal interests required for recommendations
 */
export const createPreStudentSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  educationLevel: EducationLevelEnum,
  currentGrade: GradeEnum,
  targetCountries: z
    .array(z.string())
    .min(1, "At least one target country is required"),
  academicInterests: z
    .array(z.string())
    .min(
      3,
      "At least 3 academic interests are required for recommendation generation",
    ),
  personalInterests: z
    .array(z.string())
    .min(
      3,
      "At least 3 personal interests are required for recommendation generation",
    ),
  orgId: z.string().uuid("Invalid organization ID"),
  createdByMemberId: z.string().uuid("Invalid member ID"),
  createdByRole: UserRoleEnumSchema,
});

/**
 * Schema for fetching pre-student by code
 */
export const getPreStudentByCodeSchema = z.object({
  preStudentCode: z
    .string()
    .min(1, "Pre-student code is required")
    .regex(/^PRE-[A-Z0-9]{6}$/, "Invalid pre-student code format"),
  orgId: z.string().uuid("Invalid organization ID").optional(),
});

/**
 * Schema for listing pre-students by organization
 */
export const listPreStudentsByOrgSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
  status: z.enum(["PENDING", "ONBOARDED"]).optional(),
});

// Export inferred types
export type CreatePreStudentInput = z.infer<typeof createPreStudentSchema>;
export type GetPreStudentByCodeInput = z.infer<
  typeof getPreStudentByCodeSchema
>;
export type ListPreStudentsByOrgInput = z.infer<
  typeof listPreStudentsByOrgSchema
>;
