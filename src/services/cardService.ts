import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import type { Prisma } from "@prisma/client";
import type {
  CreateCardDTO,
  UpdateCardDTO,
  SubmitContactDTO,
  CardViewEvent,
  CardAnalytics,
} from "../types/cardTypes";

export const cardService = {
  /**
   * Create a new card for a user
   */
  async createCard(userId: string, data: CreateCardDTO) {
    const slug = data.slug || "default";

    // Check if slug already exists for this user
    const existing = await prisma.card.findUnique({
      where: { userId_slug: { userId, slug } },
    });
    if (existing) {
      throw ErrorFactory.conflict(`Card with slug "${slug}" already exists`);
    }

    // If this is set as default, unset any existing default
    if (data.isDefault) {
      await prisma.card.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If this is the user's first card, make it default
    const cardCount = await prisma.card.count({ where: { userId } });
    const isDefault = data.isDefault ?? cardCount === 0;

    const card = await prisma.card.create({
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
        isDefault,
      },
    });

    return card;
  },

  /**
   * Get all cards for a user
   */
  async getUserCards(userId: string) {
    return prisma.card.findMany({
      where: { userId },
      include: {
        _count: { select: { contacts: true, views: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  },

  /**
   * Get a single card by ID (must belong to the user)
   */
  async getCardById(userId: string, cardId: string) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        _count: { select: { contacts: true, views: true } },
      },
    });

    if (!card || card.userId !== userId) {
      throw ErrorFactory.notFound("Card not found");
    }

    return card;
  },

  /**
   * Update a card
   */
  async updateCard(userId: string, cardId: string, data: UpdateCardDTO) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.userId !== userId) {
      throw ErrorFactory.notFound("Card not found");
    }

    // If changing slug, check for conflicts
    if (data.slug && data.slug !== card.slug) {
      const existing = await prisma.card.findUnique({
        where: { userId_slug: { userId, slug: data.slug } },
      });
      if (existing) {
        throw ErrorFactory.conflict(
          `Card with slug "${data.slug}" already exists`,
        );
      }
    }

    // If setting as default, unset others
    if (data.isDefault && !card.isDefault) {
      await prisma.card.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.card.update({
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
          contactFields: data.contactFields as unknown as Prisma.InputJsonValue,
        }),
        ...(data.theme !== undefined && {
          theme: data.theme as unknown as Prisma.InputJsonValue,
        }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        _count: { select: { contacts: true, views: true } },
      },
    });
  },

  /**
   * Delete a card
   */
  async deleteCard(userId: string, cardId: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.userId !== userId) {
      throw ErrorFactory.notFound("Card not found");
    }

    await prisma.card.delete({ where: { id: cardId } });

    // If deleted card was default, promote the next one
    if (card.isDefault) {
      const nextCard = await prisma.card.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      if (nextCard) {
        await prisma.card.update({
          where: { id: nextCard.id },
          data: { isDefault: true },
        });
      }
    }
  },

  /**
   * Duplicate a card with a new slug
   */
  async duplicateCard(userId: string, cardId: string, newSlug: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.userId !== userId) {
      throw ErrorFactory.notFound("Card not found");
    }

    const existing = await prisma.card.findUnique({
      where: { userId_slug: { userId, slug: newSlug } },
    });
    if (existing) {
      throw ErrorFactory.conflict(`Card with slug "${newSlug}" already exists`);
    }

    return prisma.card.create({
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
        isDefault: false,
      },
    });
  },

  // ========================================
  // PUBLIC CARD ACCESS (no auth needed)
  // ========================================

  /**
   * Get a public card by username + optional slug
   */
  async getPublicCard(username: string, slug?: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, name: true, username: true, avatarUrl: true },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    let card;
    if (slug) {
      card = await prisma.card.findUnique({
        where: { userId_slug: { userId: user.id, slug } },
      });
    } else {
      // Get default card
      card = await prisma.card.findFirst({
        where: { userId: user.id, isDefault: true, isActive: true },
      });
      // Fallback to any active card
      if (!card) {
        card = await prisma.card.findFirst({
          where: { userId: user.id, isActive: true },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    if (!card || !card.isActive) {
      throw ErrorFactory.notFound("Card not found");
    }

    return { user, card };
  },

  /**
   * Submit contact info (scanner shares their details)
   */
  async submitContact(cardId: string, data: SubmitContactDTO) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
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

    const where: Record<string, unknown> = { userId };

    if (options.cardId) where.cardId = options.cardId;

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { company: { contains: options.search, mode: "insensitive" } },
      ];
    }

    if (options.tags?.length) {
      where.tags = { hasSome: options.tags };
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
    const contact = await prisma.cardContact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.userId !== userId) {
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
    const contact = await prisma.cardContact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.userId !== userId) {
      throw ErrorFactory.notFound("Contact not found");
    }

    await prisma.cardContact.delete({ where: { id: contactId } });
  },

  /**
   * Export contacts as CSV
   */
  async exportContacts(userId: string, cardId?: string) {
    const where: Record<string, unknown> = { userId };
    if (cardId) where.cardId = cardId;

    const contacts = await prisma.cardContact.findMany({
      where,
      include: { card: { select: { slug: true } } },
      orderBy: { scannedAt: "desc" },
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
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.userId !== userId) {
      throw ErrorFactory.notFound("Card not found");
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const views = await prisma.cardView.findMany({
      where: { cardId, viewedAt: { gte: since } },
      select: {
        ipHash: true,
        clickedLink: true,
        viewedAt: true,
        country: true,
      },
    });

    const totalViews = views.length;
    const uniqueIps = new Set(
      views.filter((v) => v.ipHash).map((v) => v.ipHash),
    );
    const uniqueViews = uniqueIps.size || totalViews;

    const totalContacts = await prisma.cardContact.count({
      where: { cardId, scannedAt: { gte: since } },
    });

    const conversionRate =
      totalViews > 0 ? (totalContacts / totalViews) * 100 : 0;

    // Link clicks
    const clickMap = new Map<string, number>();
    for (const v of views) {
      if (v.clickedLink) {
        clickMap.set(v.clickedLink, (clickMap.get(v.clickedLink) || 0) + 1);
      }
    }
    const linkClicks = Array.from(clickMap.entries())
      .map(([link, count]) => ({ link, count }))
      .sort((a, b) => b.count - a.count);

    // Views by day
    const dayMap = new Map<string, number>();
    for (const v of views) {
      const day = v.viewedAt.toISOString().split("T")[0];
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    const viewsByDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top countries
    const countryMap = new Map<string, number>();
    for (const v of views) {
      if (v.country) {
        countryMap.set(v.country, (countryMap.get(v.country) || 0) + 1);
      }
    }
    const topCountries = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
};
