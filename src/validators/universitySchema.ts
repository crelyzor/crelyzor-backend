import { z } from "zod";

export const CreateUniversitySchema = z.object({
  title: z.string().min(1, "University title is required"),
  logo: z.string().url().optional(),
  location: z.string().optional(),
  isCustom: z.boolean().default(false),
  details: z
    .object({
      url: z.string().url().optional(),
      qsrank: z.string().optional(),
      status: z.string().optional(),
      researchOutput: z.string().optional(),
      scholarships: z.string().optional(),
      internationalStudents: z.string().optional(),
      tuitionFees: z.string().optional(),
      total: z.string().optional(),
      size: z.string().optional(),
      extraDetails: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

export const GetUniversitiesQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("10"),
  orgIds: z.union([z.string(), z.array(z.string())]).optional(),
});

export const SearchUniversitiesQuerySchema = z.object({
  name: z.string().min(1, "Search query is required"),
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("10"),
  orgIds: z.union([z.string(), z.array(z.string())]).optional(),
});

export type CreateUniversityRequest = z.infer<typeof CreateUniversitySchema>;
export type GetUniversitiesQuery = z.infer<typeof GetUniversitiesQuerySchema>;
export type SearchUniversitiesQuery = z.infer<
  typeof SearchUniversitiesQuerySchema
>;
