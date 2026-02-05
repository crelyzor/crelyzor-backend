import { application } from "express";
import { z } from "zod";

export const CollegeStatusEnum = z.enum(["SAFE", "TARGET", "DREAM"]);
export const ApplicationStageEnum = z.enum([
  "NOT_APPLIED",
  "CONSIDERING",
  "APPLIED",
  "ADMITTED",
  "REJECTED",
]);
export const CreateCollegeDetailSchema = z.object({
  studentOrgMemberId: z
    .string()
    .uuid({ message: "Valid studentOrgMemberId is required" }),
  collegeName: z.string().min(1, "College name is required"),
  country: z.string().optional(),
  email: z.string().email().optional(),
  duration: z.string().optional(),
  estimatedFee: z.string().optional(),
  courses: z.array(z.string()).optional().default([]),
  requiredTests: z.array(z.string()).optional().default([]),
  status: CollegeStatusEnum.default("DREAM"),
  applicationStage: ApplicationStageEnum.default("CONSIDERING"),
  // Linking to University
  universityId: z.string().uuid().optional(),
});

export const BulkCreateCollegeDetailSchema = z.object({
  items: z.array(CreateCollegeDetailSchema).min(1),
});

export const UpdateCollegeDetailSchema = z.object({
  collegeName: z.string().optional(),
  country: z.string().optional(),
  email: z.string().email().optional(),
  duration: z.string().optional(),
  estimatedFee: z.string().optional(),
  courses: z.array(z.string()).optional(),
  requiredTests: z.array(z.string()).optional(),
  status: CollegeStatusEnum.optional(),
  applicationStage: ApplicationStageEnum.optional(),
  universityId: z.string().uuid().nullable().optional(),
});

export const ListCollegeDetailQuerySchema = z
  .object({
    page: z.string().optional().default("1"),
    limit: z.string().optional().default("10"),
    // FE should send only studentOrgMemberId
    studentOrgMemberId: z.string().uuid().optional(),
    status: CollegeStatusEnum.optional(),
    applicationStage: ApplicationStageEnum.optional(),
    search: z.string().optional(),
    orgIds: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .refine(
    (data) =>
      data.studentOrgMemberId ||
      data.status ||
      data.applicationStage ||
      data.orgIds,
    {
      message:
        "Provide studentOrgMemberId, orgIds, or a status/applicationStage filter",
    },
  );

export type CreateCollegeDetailRequest = z.infer<
  typeof CreateCollegeDetailSchema
>;
export type BulkCreateCollegeDetailRequest = z.infer<
  typeof BulkCreateCollegeDetailSchema
>;
export type UpdateCollegeDetailRequest = z.infer<
  typeof UpdateCollegeDetailSchema
>;
export type ListCollegeDetailQuery = z.infer<
  typeof ListCollegeDetailQuerySchema
>;
