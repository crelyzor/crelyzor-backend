import { z } from "zod";
import { TEMPLATE_IDS } from "../templates/cardTemplates";

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalTrimmedString = (schema: z.ZodTypeAny) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

const cardLinkSchema = z.object({
  type: z.string().max(50).default(""),
  url: z.string().url(),
  label: z.string().max(100).default(""),
  icon: z.string().max(50).optional(),
});

const contactFieldsSchema = z.object({
  phone: optionalTrimmedString(z.string().max(30)),
  email: optionalTrimmedString(z.string().email()),
  location: optionalTrimmedString(z.string().max(200)),
  website: optionalTrimmedString(z.string().url()),
  bookingUrl: optionalTrimmedString(z.string().url()),
});

const themeSchema = z.object({
  primaryColor: z.string().max(20).optional(),
  backgroundColor: z.string().max(20).optional(),
  fontFamily: z.string().max(50).optional(),
  layout: z.enum(["classic", "modern", "minimal"]).optional(),
  darkMode: z.boolean().optional(),
});

const slugField = z
  .string()
  .min(1)
  .max(50)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Slug must be lowercase alphanumeric with hyphens",
  )
  .regex(/^(?!.*--)/, "No consecutive hyphens")
  .optional();

const templateIdField = z.enum(TEMPLATE_IDS).optional();

export const createCardSchema = z.object({
  slug: slugField,
  displayName: z.string().min(1).max(100),
  title: z.string().max(200).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  links: z.array(cardLinkSchema).max(20).optional(),
  contactFields: contactFieldsSchema.optional(),
  theme: themeSchema.optional(),
  templateId: templateIdField,
  showQr: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const updateCardSchema = z.object({
  slug: slugField,
  displayName: z.string().min(1).max(100).optional(),
  title: z.string().max(200).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  links: z.array(cardLinkSchema).max(20).optional(),
  contactFields: contactFieldsSchema.optional(),
  theme: themeSchema.optional(),
  templateId: templateIdField,
  showQr: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const previewCardSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS),
  displayName: z.string().min(1).max(100),
  title: z.string().max(200).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  links: z.array(cardLinkSchema).max(5).optional(),
  contactFields: contactFieldsSchema.optional(),
  accentColor: z.string().max(20).optional(),
  showQr: z.boolean().optional(),
  slug: z.string().max(50).optional(),
});

export const submitContactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(100).optional(),
  note: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.replace(/<[^>]*>/g, "").trim()),
});

export const trackViewSchema = z.object({
  clickedLink: z.string().max(500).optional(),
});

export const duplicateCardSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Slug must be lowercase alphanumeric with hyphens",
    )
    .regex(/^(?!.*--)/, "No consecutive hyphens"),
});

export const getContactsSchema = z.object({
  cardId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  tags: z.string().optional(),
  page: z.coerce.number().int().positive().max(1000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateContactTagsSchema = z.object({
  tags: z.array(z.string().max(50)).max(20),
});

export const getCardAnalyticsSchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});
