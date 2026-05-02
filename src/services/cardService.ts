import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { logger } from "../utils/logging/logger";
import type { Prisma } from "@prisma/client";
import { parse as parseCsv } from "csv-parse/sync";
import type {
  CreateCardDTO,
  UpdateCardDTO,
  PreviewCardDTO,
  SubmitContactDTO,
  CardViewEvent,
  CardAnalytics,
  CardContactFields,
  CardLink,
  CardTheme,
} from "../types/cardTypes";
import { renderCardHtml } from "../templates/renderCard";
import {
  templateList,
  type TemplateId,
  type CardTemplateData,
} from "../templates/cardTemplates";

const CARDS_PUBLIC_URL = process.env.PUBLIC_URL ?? "";

// Helper: build public URL for a card
function buildPublicUrl(
  username: string,
  slug: string,
  isDefault: boolean,
): string {
  if (isDefault) return `${CARDS_PUBLIC_URL}/${username}`;
  return `${CARDS_PUBLIC_URL}/${username}/${slug}`;
}

// Helper: build template data from card fields
function buildTemplateData(
  card: {
    displayName: string;
    title?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    links: unknown;
    contactFields: unknown;
    theme: unknown;
    showQr: boolean;
  },
  publicUrl: string,
): CardTemplateData {
  const theme = (card.theme ?? {}) as CardTheme;
  const links = (card.links ?? []) as CardLink[];
  const contactFields = (card.contactFields ?? {}) as CardContactFields;

  return {
    displayName: card.displayName,
    title: card.title,
    bio: card.bio,
    avatarUrl: card.avatarUrl,
    links,
    contactFields,
    accentColor: theme.primaryColor || "#d4af61",
    publicUrl,
    showQr: card.showQr,
  };
}

export const cardService = {
  /**
   * Get available card templates
   */
  getTemplates() {
    return templateList;
  },

  /**
   * Preview card HTML without saving
   */
  async previewCard(userId: string, data: PreviewCardDTO) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const username = user?.username ?? "preview";
    const publicUrl = buildPublicUrl(
      username,
      data.slug || "default",
      !data.slug,
    );

    const templateData: CardTemplateData = {
      displayName: data.displayName,
      title: data.title,
      bio: data.bio,
      avatarUrl: data.avatarUrl,
      links: data.links ?? [],
      contactFields: data.contactFields ?? {},
      accentColor: data.accentColor || "#d4af61",
      publicUrl,
      showQr: data.showQr ?? true,
    };

    return renderCardHtml(data.templateId as TemplateId, templateData);
  },

  /**
   * Create a new card for a user
   */
  async createCard(userId: string, data: CreateCardDTO) {
    const slug = data.slug || "default";

    // Parallelize slug conflict check, card count, and username lookup
    const [existing, cardCount, user] = await Promise.all([
      prisma.card.findFirst({
        where: { userId, slug, isDeleted: false },
        select: { id: true },
      }),
      prisma.card.count({ where: { userId, isDeleted: false } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }),
    ]);

    if (existing) {
      throw ErrorFactory.conflict(`Card with slug "${slug}" already exists`);
    }

    const isDefault = data.isDefault ?? cardCount === 0;
    const username = user?.username ?? "user";
    const templateId = (data.templateId || "executive") as TemplateId;
    const showQr = data.showQr ?? true;

    // Step 1 (outside transaction): Render HTML first.
    // renderCardHtml is async and can be slow (template compilation). Running it
    // outside the transaction avoids the 15s timeout risk from async I/O.
    const draftData = {
      userId,
      slug,
      displayName: data.displayName,
      title: data.title,
      bio: data.bio,
      avatarUrl: data.avatarUrl,
      coverUrl: data.coverUrl,
      links: data.links ?? [],
      contactFields: data.contactFields ?? {},
      theme: data.theme ?? {},
      templateId,
      showQr,
      isDefault,
    };
    const publicUrl = buildPublicUrl(username, slug, isDefault);
    const templateData = buildTemplateData(draftData as any, publicUrl);
    const { htmlContent, htmlBackContent } = await renderCardHtml(
      templateId,
      templateData,
    );

    // Step 2 (inside transaction): 3 DB writes atomically.
    // 1. Conditionally unset existing defaults
    // 2. Create the card record
    // 3. Write the pre-rendered HTML onto the new card
    const updatedCard = await prisma.$transaction(
      async (tx) => {
        if (data.isDefault) {
          await tx.card.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        const card = await tx.card.create({
          data: {
            userId,
            slug,
            displayName: data.displayName,
            title: data.title,
            bio: data.bio,
            avatarUrl: data.avatarUrl,
            coverUrl: data.coverUrl,
            links: (data.links ?? []) as unknown as Prisma.InputJsonValue,
            contactFields: (data.contactFields ??
              {}) as unknown as Prisma.InputJsonValue,
            theme: (data.theme ?? {}) as unknown as Prisma.InputJsonValue,
            templateId,
            showQr,
            isDefault,
          },
        });

        return tx.card.update({
          where: { id: card.id },
          data: { htmlContent, htmlBackContent },
        });
      },
      { timeout: 15000 },
    );

    return updatedCard;
  },

  /**
   * Get all cards for a user
   */
  async getUserCards(userId: string) {
    const MAX_USER_CARDS = 50;
    return prisma.card.findMany({
      where: { userId, isDeleted: false },
      include: {
        _count: { select: { contacts: true, views: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: MAX_USER_CARDS,
    });
  },

  /**
   * Get a single card by ID (must belong to the user)
   */
  async getCardById(userId: string, cardId: string) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
      include: {
        _count: { select: { contacts: true, views: true } },
      },
    });

    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    return card;
  },

  /**
   * Update a card
   */
  async updateCard(userId: string, cardId: string, data: UpdateCardDTO) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
    });
    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    // If changing slug, check for conflicts (excluding deleted cards)
    if (data.slug && data.slug !== card.slug) {
      const existing = await prisma.card.findFirst({
        where: { userId, slug: data.slug, isDeleted: false },
      });
      if (existing) {
        throw ErrorFactory.conflict(
          `Card with slug "${data.slug}" already exists`,
        );
      }
    }

    // Regenerate HTML before transaction to avoid async I/O inside tx
    const contentFields = [
      "displayName",
      "title",
      "bio",
      "avatarUrl",
      "links",
      "contactFields",
      "theme",
      "templateId",
      "showQr",
      "slug",
    ];
    const needsRegen = contentFields.some(
      (f) => (data as Record<string, unknown>)[f] !== undefined,
    );

    let htmlContent: string | undefined;
    let htmlBackContent: string | undefined;

    if (needsRegen) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      const username = user?.username ?? "user";
      const effectiveSlug = data.slug ?? card.slug;
      const effectiveIsDefault = data.isDefault ?? card.isDefault;
      const templateId = ((data.templateId ?? card.templateId) ||
        "executive") as TemplateId;
      const publicUrl = buildPublicUrl(
        username,
        effectiveSlug,
        effectiveIsDefault,
      );
      const mergedCard = {
        displayName: data.displayName ?? card.displayName,
        title: data.title ?? card.title,
        bio: data.bio ?? card.bio,
        avatarUrl: data.avatarUrl ?? card.avatarUrl,
        links: data.links ?? card.links,
        contactFields: data.contactFields ?? card.contactFields,
        theme: data.theme ?? card.theme,
        showQr: data.showQr ?? card.showQr,
      };
      const templateData = buildTemplateData(
        mergedCard as Parameters<typeof buildTemplateData>[0],
        publicUrl,
      );
      ({ htmlContent, htmlBackContent } = await renderCardHtml(
        templateId,
        templateData,
      ));
    }

    return prisma.$transaction(
      async (tx) => {
        // If setting as default, unset others
        if (data.isDefault && !card.isDefault) {
          await tx.card.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.card.update({
          where: { id: cardId },
          data: {
            ...(data.slug !== undefined && { slug: data.slug }),
            ...(data.displayName !== undefined && {
              displayName: data.displayName,
            }),
            ...(data.title !== undefined && { title: data.title }),
            ...(data.bio !== undefined && { bio: data.bio }),
            ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
            ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
            ...(data.links !== undefined && {
              links: data.links as unknown as Prisma.InputJsonValue,
            }),
            ...(data.contactFields !== undefined && {
              contactFields:
                data.contactFields as unknown as Prisma.InputJsonValue,
            }),
            ...(data.theme !== undefined && {
              theme: data.theme as unknown as Prisma.InputJsonValue,
            }),
            ...(data.templateId !== undefined && {
              templateId: data.templateId,
            }),
            ...(data.showQr !== undefined && { showQr: data.showQr }),
            ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
            ...(htmlContent !== undefined && { htmlContent, htmlBackContent }),
          },
          include: {
            _count: { select: { contacts: true, views: true } },
          },
        });
      },
      { timeout: 15000 },
    );
  },

  /**
   * Delete a card
   */
  async deleteCard(userId: string, cardId: string) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
    });
    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.card.update({
          where: { id: cardId },
          data: { isDeleted: true, deletedAt: new Date() },
        });

        // If deleted card was default, promote the next one
        if (card.isDefault) {
          const nextCard = await tx.card.findFirst({
            where: { userId, isDeleted: false },
            orderBy: { createdAt: "asc" },
          });
          if (nextCard) {
            await tx.card.update({
              where: { id: nextCard.id },
              data: { isDefault: true },
            });
          }
        }
      },
      { timeout: 15000 },
    );
  },

  /**
   * Duplicate a card with a new slug
   */
  async duplicateCard(userId: string, cardId: string, newSlug: string) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
    });
    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    const existing = await prisma.card.findFirst({
      where: { userId, slug: newSlug, isDeleted: false },
    });
    if (existing) {
      throw ErrorFactory.conflict(`Card with slug "${newSlug}" already exists`);
    }

    // Fetch user for HTML generation (outside transaction — read-only)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const username = user?.username ?? "user";
    const publicUrl = buildPublicUrl(username, newSlug, false);

    // Step 1 — create the card record (no HTML yet)
    const newCard = await prisma.$transaction(
      async (tx) => {
        return tx.card.create({
          data: {
            userId,
            slug: newSlug,
            displayName: card.displayName,
            title: card.title,
            bio: card.bio,
            avatarUrl: card.avatarUrl,
            coverUrl: card.coverUrl,
            links: (card.links ?? []) as Prisma.InputJsonValue,
            contactFields: (card.contactFields ?? {}) as Prisma.InputJsonValue,
            theme: (card.theme ?? {}) as Prisma.InputJsonValue,
            templateId: card.templateId,
            showQr: card.showQr,
            isDefault: false,
          },
        });
      },
      { timeout: 15000 },
    );

    // Step 2 — render HTML outside the transaction (async I/O must not hold a DB connection)
    const templateData = buildTemplateData(newCard, publicUrl);
    const { htmlContent, htmlBackContent } = await renderCardHtml(
      (newCard.templateId || "executive") as TemplateId,
      templateData,
    );

    // Step 3 — write HTML back (single update, no transaction needed)
    return prisma.card.update({
      where: { id: newCard.id },
      data: { htmlContent, htmlBackContent },
    });
  },

  // ========================================
  // PUBLIC CARD ACCESS (no auth needed)
  // ========================================

  /**
   * Get a public card by username + optional slug
   */
  async getPublicCard(username: string, slug?: string) {
    const cardWhere = slug
      ? { slug, isActive: true, isDeleted: false }
      : { isActive: true, isDeleted: false };

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
        cards: {
          where: cardWhere,
          orderBy: slug
            ? undefined
            : [{ isDefault: "desc" as const }, { createdAt: "asc" as const }],
          take: 1,
        },
      },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    const card = user.cards[0];

    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    const {
      userId: _userId,
      isDefault: _isDefault,
      isActive: _isActive,
      isDeleted: _isDeleted,
      deletedAt: _deletedAt,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...publicCard
    } = card;
    return {
      user: {
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      card: publicCard,
    };
  },

  /**
   * Submit contact info (scanner shares their details)
   */
  async submitContact(cardId: string, data: SubmitContactDTO) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
      select: { id: true, userId: true, isActive: true },
    });

    if (!card || !card.isActive) {
      throw ErrorFactory.notFound("Card not found");
    }

    return prisma.cardContact.create({
      data: {
        cardId: card.id,
        userId: card.userId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        note: data.note,
      },
    });
  },

  /**
   * Track a card view
   */
  async trackView(cardId: string, event: CardViewEvent) {
    try {
      await prisma.cardView.create({
        data: {
          cardId,
          ipHash: event.ipHash,
          userAgent: event.userAgent,
          referrer: event.referrer,
          country: event.country,
          city: event.city,
          clickedLink: event.clickedLink,
        },
      });
    } catch (err) {
      // Analytics write failure must never surface as an error to the card visitor
      logger.error("Failed to track card view", {
        cardId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /**
   * Generate vCard (.vcf) content for a card
   */
  generateVCard(card: {
    displayName: string;
    title?: string | null;
    bio?: string | null;
    contactFields: Record<string, string | undefined>;
    links: Array<{ type: string; url: string; label: string }>;
  }): string {
    const lines: string[] = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${card.displayName}`,
    ];

    if (card.title) lines.push(`TITLE:${card.title}`);
    if (card.bio) lines.push(`NOTE:${card.bio}`);
    if (card.contactFields.email)
      lines.push(`EMAIL:${card.contactFields.email}`);
    if (card.contactFields.phone) lines.push(`TEL:${card.contactFields.phone}`);
    if (card.contactFields.location)
      lines.push(`ADR:;;${card.contactFields.location}`);
    if (card.contactFields.website)
      lines.push(`URL:${card.contactFields.website}`);

    for (const link of card.links) {
      lines.push(`URL;type=${link.type}:${link.url}`);
    }

    lines.push("END:VCARD");
    return lines.join("\r\n");
  },

  // ========================================
  // CONTACTS MANAGEMENT (authenticated)
  // ========================================

  /**
   * Get contacts for a user's cards with pagination
   */
  async getContacts(
    userId: string,
    options: {
      cardId?: string;
      search?: string;
      tags?: string[];
      page?: number;
      limit?: number;
    },
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId, isDeleted: false };

    if (options.cardId) where.cardId = options.cardId;

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { company: { contains: options.search, mode: "insensitive" } },
      ];
    }

    if (options.tags?.length) {
      where.contactTags = {
        some: {
          tag: {
            name: { in: options.tags },
          },
        },
      };
    }

    const [contacts, total] = await Promise.all([
      prisma.cardContact.findMany({
        where,
        include: { card: { select: { slug: true, displayName: true } } },
        orderBy: { scannedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.cardContact.count({ where }),
    ]);

    return {
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Update contact tags
   */
  async updateContactTags(userId: string, contactId: string, tags: string[]) {
    const contact = await prisma.cardContact.findFirst({
      where: { id: contactId, userId, isDeleted: false },
    });
    if (!contact) {
      throw ErrorFactory.notFound("Contact not found");
    }

    return prisma.cardContact.update({
      where: { id: contactId },
      data: { tags },
    });
  },

  /**
   * Delete a contact
   */
  async deleteContact(userId: string, contactId: string) {
    const contact = await prisma.cardContact.findFirst({
      where: { id: contactId, userId, isDeleted: false },
    });
    if (!contact) {
      throw ErrorFactory.notFound("Contact not found");
    }

    // Phase 4.4: soft delete — preserve data for audit trail
    await prisma.cardContact.update({
      where: { id: contactId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  },

  /**
   * Export contacts as CSV
   */
  async exportContacts(
    userId: string,
    filters: { cardId?: string; search?: string; tags?: string } = {},
  ) {
    const { cardId, search, tags } = filters;
    const tagList = tags
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const contacts = await prisma.cardContact.findMany({
      where: {
        userId,
        isDeleted: false,
        ...(cardId ? { cardId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(tagList.length > 0 ? { tags: { hasSome: tagList } } : {}),
      },
      include: { card: { select: { slug: true } } },
      orderBy: { scannedAt: "desc" },
      take: 10000,
    });

    const header = "Name,Email,Phone,Company,Note,Card,Tags,Date\n";
    const rows = contacts
      .map(
        (c) =>
          `"${c.name}","${c.email || ""}","${c.phone || ""}","${c.company || ""}","${c.note || ""}","${c.card.slug}","${c.tags.join("; ")}","${c.scannedAt.toISOString()}"`,
      )
      .join("\n");

    return header + rows;
  },

  /**
   * Import contacts from CSV file into a card.
   * Validation: name required and at least one of email/phone required.
   */
  async importContactsFromCsv(
    userId: string,
    cardId: string,
    csvBuffer: Buffer,
  ) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
      select: { id: true },
    });

    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    const csvText = csvBuffer.toString("utf-8");

    let rows: Array<Record<string, string>>;
    try {
      rows = parseCsv(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }) as Array<Record<string, string>>;
    } catch {
      throw ErrorFactory.validation("Invalid CSV format");
    }

    if (rows.length === 0) {
      return { created: 0, skipped: 0, errors: [] as string[] };
    }

    const pick = (row: Record<string, string>, keys: string[]): string => {
      for (const key of keys) {
        const value = row[key];
        if (value && value.trim()) return value.trim();
      }
      return "";
    };

    const toCreate: Array<{
      cardId: string;
      userId: string;
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      note?: string;
    }> = [];
    const errors: string[] = [];

    rows.forEach((row, idx) => {
      const line = idx + 2;
      const name = pick(row, ["name", "Name", "full_name", "fullName"]);
      const email = pick(row, [
        "email",
        "Email",
        "email_address",
        "emailAddress",
      ]);
      const phone = pick(row, [
        "phone",
        "Phone",
        "mobile",
        "phone_number",
        "phoneNumber",
      ]);
      const company = pick(row, [
        "company",
        "Company",
        "organization",
        "Organization",
      ]);
      const note = pick(row, ["note", "Note", "notes", "Notes"]);

      if (!name) {
        errors.push(`Line ${line}: name is required`);
        return;
      }

      if (!email && !phone) {
        errors.push(`Line ${line}: email or phone is required`);
        return;
      }

      toCreate.push({
        cardId,
        userId,
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(company ? { company } : {}),
        ...(note ? { note } : {}),
      });
    });

    if (toCreate.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          await tx.cardContact.createMany({ data: toCreate });
        },
        { timeout: 15000 },
      );
    }

    return {
      created: toCreate.length,
      skipped: rows.length - toCreate.length,
      errors: errors.slice(0, 100),
    };
  },

  // ========================================
  // ANALYTICS (authenticated)
  // ========================================

  /**
   * Get analytics for a card
   */
  async getCardAnalytics(
    userId: string,
    cardId: string,
    days: number = 30,
  ): Promise<CardAnalytics> {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
    });
    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Use DB-side aggregation to avoid loading all CardView rows into memory.
    const [
      totalViews,
      uniqueViewRows,
      totalContacts,
      linkClickRows,
      countryRows,
    ] = await Promise.all([
      prisma.cardView.count({
        where: { cardId, viewedAt: { gte: since } },
      }),
      prisma.cardView.findMany({
        where: { cardId, viewedAt: { gte: since }, ipHash: { not: null } },
        select: { ipHash: true },
        distinct: ["ipHash"],
      }),
      prisma.cardContact.count({
        where: { cardId, isDeleted: false, scannedAt: { gte: since } },
      }),
      prisma.cardView.groupBy({
        by: ["clickedLink"],
        where: {
          cardId,
          viewedAt: { gte: since },
          clickedLink: { not: null },
        },
        _count: { clickedLink: true },
        orderBy: { _count: { clickedLink: "desc" } },
      }),
      prisma.cardView.groupBy({
        by: ["country"],
        where: {
          cardId,
          viewedAt: { gte: since },
          country: { not: null },
        },
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 10,
      }),
    ]);

    const uniqueViews = uniqueViewRows.length || totalViews;
    const conversionRate =
      totalViews > 0 ? (totalContacts / totalViews) * 100 : 0;

    const linkClicks = linkClickRows
      .filter((r) => r.clickedLink)
      .map((r) => ({
        link: r.clickedLink as string,
        count: r._count.clickedLink,
      }));

    const topCountries = countryRows
      .filter((r) => r.country)
      .map((r) => ({ country: r.country as string, count: r._count.country }));

    // Views by day: aggregate in the DB to avoid loading all rows into memory
    const viewsByDayRows = await prisma.$queryRaw<
      { date: string; count: number }[]
    >`
      SELECT DATE("viewedAt" AT TIME ZONE 'UTC') AS date, COUNT(*)::int AS count
      FROM "CardView"
      WHERE "cardId" = ${cardId}::uuid
        AND "viewedAt" >= ${since}
      GROUP BY DATE("viewedAt" AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `;
    const viewsByDay = viewsByDayRows.map((r) => ({
      date: String(r.date).split("T")[0],
      count: r.count,
    }));

    return {
      totalViews,
      uniqueViews,
      totalContacts,
      conversionRate: Math.round(conversionRate * 100) / 100,
      linkClicks,
      viewsByDay,
      topCountries,
    };
  },

  // ========================================
  // LINKED MEETINGS (authenticated)
  // ========================================

  /**
   * Get meetings linked to a card via participants
   */
  async getCardMeetings(userId: string, cardId: string) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!card) {
      throw ErrorFactory.notFound("Card not found");
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        isDeleted: false,
        participants: {
          some: { cardId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
            card: { select: { id: true, displayName: true, slug: true } },
          },
        },
      },
      orderBy: { startTime: "desc" },
      take: 50,
    });

    return meetings;
  },
};
