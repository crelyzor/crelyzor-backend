import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { logger } from "../utils/logging/logger";
import { Prisma, TeamRole } from "@prisma/client";
import {
  encrypt,
  decrypt,
  blindIndex,
  prismaBytes,
  type Principal,
} from "../utils/security/crypto";
import type { TeamContext } from "../middleware/authMiddleware";
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

// ── Phase 6 P5.2.a team-scoping helpers ──────────────────────────────────────

const NOT_FOUND_MESSAGE = "Card not found";

const ROLE_RANK: Record<TeamRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

/**
 * Returns the Prisma where-clause fragment that scopes a card query to the
 * caller's current context. All `cardService` read paths must spread this
 * into their `where` so a raw `where: { id }` never leaks cross-team data.
 *
 * - Personal context (teamContext null): `{ teamId: null, userId: actorId }`.
 *   Personal queries explicitly exclude team cards — those are visible only
 *   under the matching team context. This closes the pre-Phase-6 leak
 *   where a user's `GET /cards` returned every card they owned regardless
 *   of teamId (team-default cards leaked into personal lists).
 * - Team context + ADMIN/OWNER: `{ teamId = ctx.teamId }` (all team cards).
 * - Team context + MEMBER: `{ teamId = ctx.teamId, userId = actorId }`
 *   (member sees only their own team cards).
 *
 * Soft-delete is NOT part of the scope — caller must add `isDeleted: false`
 * explicitly so writes that need to inspect deleted rows still compose.
 */
function cardScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.CardWhereInput {
  if (!teamContext) {
    return { teamId: null, userId: actorId };
  }
  if (teamContext.role === TeamRole.MEMBER) {
    return { teamId: teamContext.teamId, userId: actorId };
  }
  return { teamId: teamContext.teamId };
}

/**
 * Scope a CardContact query by routing through the `card` relation. Mirrors
 * cardScope semantics: contacts on personal cards (actor-owned) under
 * personal context; contacts on team cards (all for ADMIN/OWNER, own-only
 * for MEMBER) under team context.
 *
 * Adds `card.isDeleted: false` explicitly because `cardScope` deliberately
 * omits soft-delete (its docstring documents this) — contact reads must not
 * surface contacts attached to soft-deleted cards.
 */
function contactScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.CardContactWhereInput {
  return { card: { ...cardScope(actorId, teamContext), isDeleted: false } };
}

// CSV import hard cap. Prevents an ADMIN from exhausting KMS encrypt() calls
// or DB write capacity via a multi-million-row CSV. 5,000 is generous for
// legitimate bulk imports; anything larger should chunk client-side.
const MAX_IMPORT_ROWS = 5000;

type CardForAccess = {
  userId: string;
  teamId: string | null;
  isDeleted: boolean;
};

/**
 * Derives the encrypt/decrypt principal for content scoped to a card
 * (currently only `CardContact.{email,phone,note}`). **Always read from the
 * card row, never from the actor.** A team admin replying to a contact
 * exchange on a team card must encrypt under the team DEK so other admins
 * can read it.
 *
 * `Card.teamId` is immutable post-creation — `transferOwnership` only
 * updates `Card.userId`. Schema strict-mode + service-layer strip in
 * `updateCard` prevents any future PATCH from flipping `teamId`. So the
 * principal stays stable for the card's lifetime.
 */
export function principalForCard(card: {
  userId: string;
  teamId: string | null;
}): Principal {
  return card.teamId
    ? { type: "team", id: card.teamId }
    : { type: "user", id: card.userId };
}

/**
 * Centralized access gate for card CRUD. Throws 404 with a uniform body for
 * every "not accessible" branch — same enumeration-collapse pattern as P1/P2/P5.1.
 */
export function verifyCardAccess(
  actorId: string,
  card: CardForAccess,
  teamContext: TeamContext | null,
  action: "read" | "mutate",
): void {
  if (card.isDeleted) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }

  const isOwner = card.userId === actorId;

  if (!teamContext) {
    // Personal context: card must be personal AND owned by the actor.
    if (card.teamId !== null || !isOwner) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    return;
  }

  // Team context: card must belong to the same team.
  if (card.teamId !== teamContext.teamId) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }

  if (teamContext.role === TeamRole.MEMBER) {
    // MEMBER: own team cards only. Same rule for read + mutate — no
    // participant-style visibility (cards have no participant concept).
    if (!isOwner) throw new AppError(NOT_FOUND_MESSAGE, 404);
  }
  // ADMIN / OWNER: any card in the team is accessible (read or mutate).
  void ROLE_RANK; // keep referenced for symmetry; comparisons happen elsewhere
  void action;
}

/**
 * One-shot card access gate. Slim-fetches the card, runs verifyCardAccess,
 * returns the row. Mirrors `assertMeetingAccess`.
 */
export async function assertCardAccess(
  actorId: string,
  cardId: string,
  teamContext: TeamContext | null,
  action: "read" | "mutate",
): Promise<CardForAccess & { id: string }> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      userId: true,
      teamId: true,
      isDeleted: true,
    },
  });
  if (!card) {
    throw new AppError(NOT_FOUND_MESSAGE, 404);
  }
  verifyCardAccess(actorId, card, teamContext, action);
  return card;
}

/**
 * Reject MEMBER role on team-context card creation/duplication. Team cards
 * are created either by `teamService.createTeam` (the auto-default card) or
 * by ADMIN+. A MEMBER spamming team cards via this endpoint is not in the
 * design.
 */
function assertCanCreateTeamCard(teamContext: TeamContext | null): void {
  if (teamContext && teamContext.role === TeamRole.MEMBER) {
    throw new AppError(
      "Only team admins or the owner can create team cards",
      403,
    );
  }
}

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
   * Create a new card for a user.
   *
   * Phase 6 P5.2.a — accepts an optional teamContext. Under team context,
   * MEMBER role is rejected (team-card creation is ADMIN/OWNER only;
   * auto-default team cards come from `teamService.createTeam`). The new
   * card inherits `teamId = ctx.teamId` so encryption + reads scope to the
   * team going forward.
   */
  async createCard(
    userId: string,
    data: CreateCardDTO,
    teamContext: TeamContext | null = null,
  ) {
    // Role check is the first line of the function so it runs before any
    // DB probe (the slug-conflict lookup below would otherwise leak which
    // team slugs are taken to a member who is forbidden to create cards).
    assertCanCreateTeamCard(teamContext);

    const teamId = teamContext?.teamId ?? null;
    const slug = data.slug || "default";

    // Parallelize slug conflict check, card count, and username lookup.
    // Slug uniqueness is per `(userId, slug)` (see Card.@@unique), so the
    // conflict probe and the card-count both scope to userId. Team cards
    // owned by the same user still go through this same uniqueness model.
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
    const templateData = buildTemplateData(draftData, publicUrl);
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

        if (data.isTeamCard && teamId) {
          await tx.card.updateMany({
            where: { teamId, isTeamCard: true },
            data: { isTeamCard: false },
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
            teamId,
            isTeamCard: data.isTeamCard && teamId ? true : false,
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
   * Get all cards for a user, scoped by team context.
   *
   * Phase 6 P5.2.a — personal context returns only personal cards (`teamId: null`);
   * team context returns team cards (all for ADMIN/OWNER, own-only for MEMBER).
   * This closes the pre-Phase-6 leak where team-default cards showed up in
   * personal `GET /cards` responses.
   */
  async getUserCards(userId: string, teamContext: TeamContext | null = null) {
    const MAX_USER_CARDS = 50;
    return prisma.card.findMany({
      where: {
        isDeleted: false,
        ...cardScope(userId, teamContext),
      },
      include: {
        _count: { select: { contacts: true, views: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: MAX_USER_CARDS,
    });
  },

  /**
   * Get a single card by ID — single-fetch + in-memory verifyCardAccess.
   * Card include is leaner than meetings; no need for the two-step
   * (slim probe → access → full include) pattern.
   */
  async getCardById(
    userId: string,
    cardId: string,
    teamContext: TeamContext | null = null,
  ) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        _count: { select: { contacts: true, views: true } },
        team: { select: { id: true, slug: true } },
      },
    });

    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }
    verifyCardAccess(userId, card, teamContext, "read");

    return card;
  },

  /**
   * Update a card. Team scope honoured via assertCardAccess.
   *
   * Phase 6 P5.2.a — the validator (`updateCardSchema`) is `.strict()` so a
   * forged body can't carry `teamId` or `userId`. Even if a future schema
   * change loosens that, the spread below explicitly ignores both fields.
   */
  async updateCard(
    userId: string,
    cardId: string,
    data: UpdateCardDTO,
    teamContext: TeamContext | null = null,
  ) {
    await assertCardAccess(userId, cardId, teamContext, "mutate");
    // Re-fetch with the full row shape needed downstream. The access check
    // above is the security gate; this read is only for data the update
    // path needs (templateId, slug, etc).
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
    });
    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    // If changing slug, check for conflicts (excluding deleted cards).
    // Slug uniqueness is per `(Card.userId, Card.slug)` — scope to the
    // CARD's owner, not the actor. An admin updating someone else's team
    // card must still respect that user's own-slug uniqueness.
    if (data.slug && data.slug !== card.slug) {
      const existing = await prisma.card.findFirst({
        where: { userId: card.userId, slug: data.slug, isDeleted: false },
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
      // Username for the public URL belongs to the card owner, not the
      // actor (an admin editing another member's team card still publishes
      // under the member's namespace).
      const user = await prisma.user.findUnique({
        where: { id: card.userId },
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
        // If setting as default, unset others — scope to the card OWNER,
        // not the actor. Default-card is per-owner state.
        if (data.isDefault && !card.isDefault) {
          await tx.card.updateMany({
            where: { userId: card.userId, isDefault: true },
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
   * Delete a card. Team scope honoured via assertCardAccess.
   * Default-card promotion scopes to the OWNER's card pool, not the actor's.
   */
  async deleteCard(
    userId: string,
    cardId: string,
    teamContext: TeamContext | null = null,
  ) {
    await assertCardAccess(userId, cardId, teamContext, "mutate");
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
      select: { id: true, isDefault: true, userId: true },
    });
    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.card.update({
          where: { id: cardId },
          data: { isDeleted: true, deletedAt: new Date() },
        });

        // If deleted card was default, promote the next one — scope to the
        // card OWNER's pool (default-card is per-owner state).
        if (card.isDefault) {
          const nextCard = await tx.card.findFirst({
            where: { userId: card.userId, isDeleted: false },
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
   * Duplicate a card with a new slug.
   *
   * Phase 6 P5.2.a — source access via assertCardAccess(read); team context
   * propagates to the dup (personal → personal, team → team with same
   * teamId). MEMBER role rejected on team-context creation just like
   * createCard. The duplicate is owned by the actor (`userId = actor`),
   * inherits the source's teamId, and the slug-conflict probe scopes to
   * the actor's own slug pool.
   */
  async duplicateCard(
    userId: string,
    cardId: string,
    newSlug: string,
    teamContext: TeamContext | null = null,
  ) {
    // Duplication is effectively a create — apply the same role gate.
    assertCanCreateTeamCard(teamContext);

    await assertCardAccess(userId, cardId, teamContext, "read");
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
    });
    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    // Slug uniqueness on the destination is per (actor, newSlug). The dup
    // is owned by the actor, so the probe scopes to userId (not card.userId).
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
            // Phase 6 P5.2.a — dup inherits the source card's team scope.
            // Under personal context this stays null; under team context
            // the source was already team-scoped (verified by access gate),
            // so this matches ctx.teamId.
            teamId: card.teamId,
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

    const user = await prisma.user.findFirst({
      where: { username, isDeleted: false },
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
   * Submit contact info (scanner shares their details).
   *
   * Phase 6 P5.2.a — encryption principal is derived from the **card row**
   * via `principalForCard(card)`. Team cards encrypt under the team DEK so
   * any team admin can read the contact later (via P5.2.b's getContacts).
   * Personal cards continue under the owner's user DEK.
   *
   * No `verifyJWT` / `resolveTeamContext` on the public submit-contact flow:
   * the public form is the access control, and the principal is derived
   * server-side from the card row — never from the (anonymous) submitter.
   */
  async submitContact(cardId: string, data: SubmitContactDTO) {
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
      select: { id: true, userId: true, teamId: true, isActive: true },
    });

    if (!card || !card.isActive) {
      throw ErrorFactory.notFound("Card not found");
    }

    const cardPrincipal = principalForCard(card);
    const [encEmail, encPhone, encNote] = await Promise.all([
      data.email ? encrypt(data.email, cardPrincipal) : Promise.resolve(null),
      data.phone ? encrypt(data.phone, cardPrincipal) : Promise.resolve(null),
      data.note ? encrypt(data.note, cardPrincipal) : Promise.resolve(null),
    ]);

    const contact = await prisma.cardContact.create({
      data: {
        cardId: card.id,
        userId: card.userId,
        name: data.name,
        email: encEmail ?? undefined,
        phone: encPhone ?? undefined,
        company: data.company,
        note: encNote ?? undefined,
        emailBidx: data.email ? prismaBytes(blindIndex(data.email)) : undefined,
        phoneBidx: data.phone ? prismaBytes(blindIndex(data.phone)) : undefined,
      },
    });

    return {
      ...contact,
      email: data.email ?? null,
      phone: data.phone ?? null,
      note: data.note ?? null,
    };
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
   * Get contacts for a user's cards with pagination.
   *
   * Phase 6 P5.2.b — scoped via `contactScope(actor, teamContext)` rather
   * than the old `cardContact.userId = actor` filter. Under team context
   * ADMIN/OWNER see contacts across all team cards; MEMBER sees own only.
   * Per-row decrypt uses `principalForCard(c.card)` so contacts encrypted
   * under the team DEK (post-P5.2.a) decrypt cleanly.
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
    teamContext: TeamContext | null = null,
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CardContactWhereInput = {
      isDeleted: false,
      ...contactScope(userId, teamContext),
    };

    if (options.cardId) where.cardId = options.cardId;

    if (options.search) {
      // name and company are plaintext (ILIKE); email is encrypted — exact
      // blind-index match only. blindIndex uses HMAC_BLIND_INDEX_KEY which
      // doesn't change with principal, so search works across both scopes.
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { company: { contains: options.search, mode: "insensitive" } },
        ...(options.search.includes("@")
          ? [{ emailBidx: { equals: prismaBytes(blindIndex(options.search)) } }]
          : []),
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

    const [rawContacts, total] = await Promise.all([
      prisma.cardContact.findMany({
        where,
        include: {
          // Extended select: userId + teamId needed for principalForCard
          // per-row derivation. Stripped from the response shape below.
          card: {
            select: {
              id: true,
              slug: true,
              displayName: true,
              userId: true,
              teamId: true,
            },
          },
        },
        orderBy: { scannedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.cardContact.count({ where }),
    ]);

    const contacts = await Promise.all(
      rawContacts.map(async (c) => {
        const cardPrincipal = principalForCard(c.card);
        return {
          ...c,
          email: c.email
            ? await decrypt(c.email, cardPrincipal).catch(() => null)
            : null,
          phone: c.phone
            ? await decrypt(c.phone, cardPrincipal).catch(() => null)
            : null,
          note: c.note
            ? await decrypt(c.note, cardPrincipal).catch(() => null)
            : null,
          emailBidx: undefined,
          phoneBidx: undefined,
          // Strip the internal-only fields used for principal derivation
          // before returning to the caller.
          card: {
            id: c.card.id,
            slug: c.card.slug,
            displayName: c.card.displayName,
          },
        };
      }),
    );

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
   * Update contact tags.
   *
   * Phase 6 P5.2.b — loads the contact with parent card info, runs
   * verifyCardAccess(mutate). Under team context ADMIN/OWNER can retag any
   * team-card contact; MEMBER can retag own-card contacts only.
   *
   * Returns the **decrypted** contact (matching getContacts shape) so the
   * frontend can render the row without re-fetching. Per security review:
   * never return encrypted Bytes in the PATCH response.
   */
  async updateContactTags(
    userId: string,
    contactId: string,
    tags: string[],
    teamContext: TeamContext | null = null,
  ) {
    const contact = await prisma.cardContact.findFirst({
      where: { id: contactId, isDeleted: false },
      include: {
        card: {
          select: {
            id: true,
            userId: true,
            teamId: true,
            isDeleted: true,
            slug: true,
            displayName: true,
          },
        },
      },
    });
    if (!contact) {
      throw new AppError("Contact not found", 404);
    }
    verifyCardAccess(userId, contact.card, teamContext, "mutate");

    const updated = await prisma.cardContact.update({
      where: { id: contactId },
      data: { tags },
      include: {
        card: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            userId: true,
            teamId: true,
          },
        },
      },
    });

    // Decrypt before returning — frontend gets the same shape as getContacts.
    const cardPrincipal = principalForCard(updated.card);
    return {
      ...updated,
      email: updated.email
        ? await decrypt(updated.email, cardPrincipal).catch(() => null)
        : null,
      phone: updated.phone
        ? await decrypt(updated.phone, cardPrincipal).catch(() => null)
        : null,
      note: updated.note
        ? await decrypt(updated.note, cardPrincipal).catch(() => null)
        : null,
      emailBidx: undefined,
      phoneBidx: undefined,
      card: {
        id: updated.card.id,
        slug: updated.card.slug,
        displayName: updated.card.displayName,
      },
    };
  },

  /**
   * Delete a contact (soft delete).
   *
   * Phase 6 P5.2.b — same access model as updateContactTags. Soft-delete
   * preserves the row for audit; ContactTag join rows stay live (filter
   * them out in tag-lookup paths instead of cascading) so a restore path
   * keeps the original tagging.
   */
  async deleteContact(
    userId: string,
    contactId: string,
    teamContext: TeamContext | null = null,
  ) {
    const contact = await prisma.cardContact.findFirst({
      where: { id: contactId, isDeleted: false },
      include: {
        card: {
          select: { id: true, userId: true, teamId: true, isDeleted: true },
        },
      },
    });
    if (!contact) {
      throw new AppError("Contact not found", 404);
    }
    verifyCardAccess(userId, contact.card, teamContext, "mutate");

    // Phase 4.4: soft delete — preserve data for audit trail
    await prisma.cardContact.update({
      where: { id: contactId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  },

  /**
   * Export contacts as CSV.
   *
   * Phase 6 P5.2.b — same scope/decrypt-principal retrofit as getContacts.
   * TODO(P5.2.c-or-follow-up): add a hard row cap (admin exporting full
   * team-contact set could be thousands of rows; current implementation
   * accumulates the full CSV in memory).
   */
  async exportContacts(
    userId: string,
    filters: { cardId?: string; search?: string; tags?: string } = {},
    teamContext: TeamContext | null = null,
  ) {
    const { cardId, search, tags } = filters;
    const tagList = tags
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const where: Prisma.CardContactWhereInput = {
      isDeleted: false,
      ...contactScope(userId, teamContext),
      ...(cardId ? { cardId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { company: { contains: search, mode: "insensitive" as const } },
              ...(search.includes("@")
                ? [{ emailBidx: { equals: prismaBytes(blindIndex(search)) } }]
                : []),
            ],
          }
        : {}),
      ...(tagList.length > 0 ? { tags: { hasSome: tagList } } : {}),
    };

    // Escape a value per RFC 4180: wrap in quotes, double internal quotes.
    // Prefix formula-triggering chars (=+-@) to prevent CSV injection in spreadsheets.
    const csvCell = (value: string): string => {
      const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const BATCH_SIZE = 500;
    const csvRows: string[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await prisma.cardContact.findMany({
        where,
        // Include userId + teamId on the card so we can derive
        // principalForCard per row (a single batch may span multiple cards
        // owned by different team members under team context).
        include: {
          card: {
            select: { slug: true, userId: true, teamId: true },
          },
        },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;

      for (const c of batch) {
        const cardPrincipal = principalForCard(c.card);
        const [email, phone, note] = await Promise.all([
          c.email
            ? decrypt(c.email, cardPrincipal).catch(() => "")
            : Promise.resolve(""),
          c.phone
            ? decrypt(c.phone, cardPrincipal).catch(() => "")
            : Promise.resolve(""),
          c.note
            ? decrypt(c.note, cardPrincipal).catch(() => "")
            : Promise.resolve(""),
        ]);
        csvRows.push(
          [
            csvCell(c.name),
            csvCell(email),
            csvCell(phone),
            csvCell(c.company || ""),
            csvCell(note),
            csvCell(c.card.slug),
            csvCell(c.tags.join("; ")),
            csvCell(c.scannedAt.toISOString()),
          ].join(","),
        );
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH_SIZE) break;
    }

    const header = "Name,Email,Phone,Company,Note,Card,Tags,Date\n";
    return header + csvRows.join("\n");
  },

  /**
   * Import contacts from CSV file into a card.
   * Validation: name required and at least one of email/phone required.
   *
   * Phase 6 P5.2.b — `assertCardAccess(mutate)` replaces the inline
   * ownership probe. Under team context, ADMIN/OWNER can import to any
   * team card; MEMBER can import to own team cards. Encryption principal
   * derived from the card row (team DEK on team cards).
   *
   * Row cap (`MAX_IMPORT_ROWS`) guards against DoS via large CSVs that
   * would otherwise exhaust KMS encrypt() throughput and DB write budget.
   * Audit trail TODO: capture `actorId` (currently lost — rows are inserted
   * with `userId: card.userId`, so an admin's import is indistinguishable
   * from the card owner's). Follow-up.
   */
  async importContactsFromCsv(
    userId: string,
    cardId: string,
    csvBuffer: Buffer,
    teamContext: TeamContext | null = null,
  ) {
    await assertCardAccess(userId, cardId, teamContext, "mutate");
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
      select: { id: true, userId: true, teamId: true },
    });

    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    const cardPrincipal = principalForCard(card);
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

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new AppError(
        `CSV exceeds ${MAX_IMPORT_ROWS}-row import limit (received ${rows.length}). Split the file and import in batches.`,
        400,
      );
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
      email?: Uint8Array<ArrayBuffer>;
      phone?: Uint8Array<ArrayBuffer>;
      company?: string;
      note?: Uint8Array<ArrayBuffer>;
      emailBidx?: Uint8Array<ArrayBuffer>;
      phoneBidx?: Uint8Array<ArrayBuffer>;
    }> = [];
    const errors: string[] = [];

    for (const [idx, row] of rows.entries()) {
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
        continue;
      }

      if (!email && !phone) {
        errors.push(`Line ${line}: email or phone is required`);
        continue;
      }

      const [encEmail, encPhone, encNote] = await Promise.all([
        email ? encrypt(email, cardPrincipal) : Promise.resolve(undefined),
        phone ? encrypt(phone, cardPrincipal) : Promise.resolve(undefined),
        note ? encrypt(note, cardPrincipal) : Promise.resolve(undefined),
      ]);
      toCreate.push({
        cardId,
        // Inserted with the CARD owner's userId (not the actor's). Stays
        // consistent with how submitContact writes ownership post-P5.2.a.
        userId: card.userId,
        name,
        ...(encEmail
          ? { email: encEmail, emailBidx: prismaBytes(blindIndex(email)) }
          : {}),
        ...(encPhone
          ? { phone: encPhone, phoneBidx: prismaBytes(blindIndex(phone)) }
          : {}),
        ...(company ? { company } : {}),
        ...(encNote ? { note: encNote } : {}),
      });
    }

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
   * Get analytics for a card.
   *
   * Phase 6 P5.2.b — assertCardAccess(read) replaces the inline ownership
   * probe. CardView rows are anonymous (no userId), so aggregates don't
   * leak PII regardless of who reads them.
   */
  async getCardAnalytics(
    userId: string,
    cardId: string,
    days: number = 30,
    teamContext: TeamContext | null = null,
  ): Promise<CardAnalytics> {
    await assertCardAccess(userId, cardId, teamContext, "read");
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
    });
    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
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
   * Get meetings linked to a card via participants.
   *
   * Phase 6 P5.2.b — assertCardAccess(read) gates card visibility, then the
   * meeting where clause adds a **meeting-level scope** so an admin viewing
   * a team card doesn't see teammates' personal meetings that happened to
   * include the team card as a participant (security review must-fix).
   *
   * Personal context: only the actor's own personal meetings.
   * Team context: meetings that are either team-scoped OR created by the
   * actor (covers the case where an actor created a personal meeting
   * involving their own team card).
   */
  async getCardMeetings(
    userId: string,
    cardId: string,
    { take = 20, skip = 0 }: { take?: number; skip?: number } = {},
    teamContext: TeamContext | null = null,
  ) {
    await assertCardAccess(userId, cardId, teamContext, "read");
    const card = await prisma.card.findFirst({
      where: { id: cardId, isDeleted: false },
      select: { id: true },
    });
    if (!card) {
      throw new AppError(NOT_FOUND_MESSAGE, 404);
    }

    const meetingVisibility: Prisma.MeetingWhereInput = teamContext
      ? { OR: [{ teamId: teamContext.teamId }, { createdById: userId }] }
      : { teamId: null, createdById: userId };

    const where: Prisma.MeetingWhereInput = {
      isDeleted: false,
      participants: { some: { cardId } },
      ...meetingVisibility,
    };

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          startTime: true,
          endTime: true,
          timezone: true,
          participants: {
            select: {
              participantType: true,
              user: { select: { id: true, name: true, avatarUrl: true } },
              card: { select: { id: true, displayName: true, slug: true } },
            },
          },
        },
        orderBy: { startTime: "desc" },
        take,
        skip,
      }),
      prisma.meeting.count({ where }),
    ]);

    return { meetings, total, hasMore: skip + meetings.length < total };
  },
};
