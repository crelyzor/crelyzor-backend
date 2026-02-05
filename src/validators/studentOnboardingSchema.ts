import { z } from "zod";

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

const GenderEnum = z.enum(["MALE", "FEMALE", "OTHERS"]);

const CompletedActivitySchema = z.object({
  categoryId: z.string().uuid("Invalid category ID"),
  activityId: z.string().uuid("Invalid activity ID").optional(),
  levelId: z.string().uuid("Invalid level ID"),
  subLevelId: z.string().uuid("Invalid sublevel ID"),
  isCustom: z.boolean().optional().default(false),
  customActivityName: z.string().optional(),
  activityDescription: z.string().optional(),
});

export const onboardStudentWithPreStudentSchema = z
  .object({
    preStudentCode: z
      .string()
      .regex(/^PRE-[A-Z0-9]{6}$/, "Invalid pre-student code format")
      .optional(),

    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email must not exceed 255 characters")
      .toLowerCase()
      .trim(),
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    countryCode: z.string().optional(),
    phoneNumber: z.string().min(10).max(15).optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),

    orgId: z.string().uuid("Invalid organization ID"),

    counsellorId: z.string().uuid("Invalid counsellor ID").optional(),

    educationLevel: EducationLevelEnum.optional(),
    currentGrade: GradeEnum.optional(),
    targetCountries: z.array(z.string()).optional(),
    academicInterests: z.array(z.string()).optional(),
    personalInterests: z.array(z.string()).optional(),

    gender: GenderEnum.optional(),
    intakeYear: z.number().int().min(2024).max(2035).optional(),

    completedActivities: z.array(CompletedActivitySchema).optional(),
  })
  .refine(
    (data) => {
      if (!data.preStudentCode && !data.name) {
        return false;
      }
      return true;
    },
    {
      message: "Name is required when pre-student code is not provided",
      path: ["name"],
    },
  );

export type OnboardStudentWithPreStudentInput = z.infer<
  typeof onboardStudentWithPreStudentSchema
>;
