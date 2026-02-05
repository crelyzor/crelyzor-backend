import { z } from "zod";

export const updateOrganizationPgFlowSchema = z.object({
  allowPaymentFlow: z.boolean({
    message: "allowPaymentFlow must be a boolean value",
  }),
});

export const organizationPgFlowParamsSchema = z.object({
  organizationId: z
    .string({
      message: "Organization ID must be a string",
    })
    .uuid("Organization ID must be a valid UUID"),
});

export type UpdateOrganizationPgFlowSchema = z.infer<
  typeof updateOrganizationPgFlowSchema
>;
export type OrganizationPgFlowParamsSchema = z.infer<
  typeof organizationPgFlowParamsSchema
>;
