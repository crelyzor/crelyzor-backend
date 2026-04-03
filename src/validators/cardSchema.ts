import { z } from "zod";

const cardLinkSchema = z.object({
  type: z.string().max(50).default(""),
  url: z.string().url(),
  label: z.string().max(100).default(""),
  icon: z.string().max(50).optional(),
});

const contactFieldsSchema = z.object({
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  location: z.string().max(200).optional(),
  website: z.string().url().optional(),
  bookingUrl: z.string().url().optional(),
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

const templateIdField = z
  .enum(["executive", "classic-bold", "minimal"])
  .optional();

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
  templateId: z.enum(["executive", "classic-bold", "minimal"]),
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
  note: z.string().max(500).optional(),
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
