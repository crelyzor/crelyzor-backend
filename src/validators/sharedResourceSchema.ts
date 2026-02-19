import { z } from "zod";

export const createResourcesSchema = z.object({
  resources: z
    .array(
      z.object({
        resourceName: z
          .string()
          .min(1, "Resource name is required")
          .max(255, "Resource name too long"),
        resourceLink: z
          .string()
          .url("Invalid URL format")
          .refine((url) => {
            try {
              const { protocol } = new URL(url);
              return protocol === "http:" || protocol === "https:";
            } catch {
              return false;
            }
          }, "URL must use HTTP or HTTPS protocol"),
        resourceType: z.string().optional(),
        resourceSize: z.string().optional(),
      }),
    )
    .min(1, "At least one resource is required")
    .max(50, "Cannot upload more than 50 resources at once"),
  folderId: z.string().uuid().optional(),
  forMemberId: z.string().uuid().optional(), // Admin uploads on behalf of another member
});

export const updateResourceSchema = z.object({
  resourceName: z.string().min(1).max(255).optional(),
  resourceLink: z
    .string()
    .url("Invalid URL format")
    .refine((url) => {
      try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "URL must use HTTP or HTTPS protocol")
    .optional(),
  resourceType: z.string().optional(),
  resourceSize: z.string().optional(),
});

export const createFolderSchema = z.object({
  folderName: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(50, "Folder name too long"),
  // Admin can create folder for any org member
  ownerOrgMemberId: z.string().uuid().optional(),
});

export const updateFolderSchema = z.object({
  folderId: z.string().uuid(),
  newFolderName: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(50, "Folder name too long"),
});

export const shareToFoldersSchema = z
  .object({
    resourceId: z.string().uuid().optional(),
    resourceIds: z.array(z.string().uuid()).optional(),
    folderId: z.string().uuid().optional(),
    folderIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (d) =>
      (d.resourceId || (d.resourceIds && d.resourceIds.length > 0)) &&
      (d.folderId || (d.folderIds && d.folderIds.length > 0)),
    {
      message: "At least one resource and one folder must be provided.",
    },
  );

export const shareResourceToMembersSchema = z.object({
  resourceId: z.string().uuid(),
  orgMemberIds: z.array(z.string().uuid()).min(1).max(200),
});

export const paginationQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const attachResourcesToTaskSchema = z.object({
  resourceIds: z
    .array(z.string().uuid("Invalid resource ID format"))
    .min(1, "At least one resource is required")
    .max(100, "Cannot attach more than 100 resources at once"),
});

export const attachResourcesToMultipleTasksSchema = z.object({
  taskIds: z
    .array(z.string().uuid("Invalid task ID format"))
    .min(1, "At least one task is required")
    .max(50, "Cannot attach to more than 50 tasks at once"),
  resourceIds: z
    .array(z.string().uuid("Invalid resource ID format"))
    .min(1, "At least one resource is required")
    .max(100, "Cannot attach more than 100 resources at once"),
});

export const unshareResourceFromMembersSchema = z.object({
  resourceId: z.string().uuid("Invalid resource ID"),
  orgMemberIds: z.array(z.string().uuid()).min(1).max(200),
});
