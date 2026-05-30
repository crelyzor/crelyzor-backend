import { Prisma } from "@prisma/client";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import type { CreateTagInput, UpdateTagInput } from "../validators/tagSchema";
import { DEFAULT_TAG_COLOR } from "../validators/tagSchema";
import { assertMeetingAccess } from "./meetings/meetingService";
import { assertCardAccess } from "./cardService";
import { assertTaskAccess } from "./tasks/taskAccess";
import type { TeamContext } from "../middleware/authMiddleware";

const TAG_SELECT = {
  id: true,
  name: true,
  color: true,
  teamId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Uniform 404 body across every Tag access failure path. Same enumeration-
// collapse pattern as meetings / cards / tasks / event-types / bookings.
const TAG_NOT_FOUND_MESSAGE = "Tag not found";

// Phase 6 P5.5.a — hard cap on team tag count to prevent namespace pollution
// by MEMBERs. Matches the listTags `take: 500` ceiling.
const MAX_TAGS_PER_TEAM = 500;

type TagForAccess = {
  id: string;
  userId: string;
  teamId: string | null;
};

type EntityType = "meeting" | "card" | "task" | "contact";

/**
 * Phase 6 P5.5.b — cross-scope defense-in-depth at attach-time.
 *
 * Under shared teamContext both `assertTagAccess` and the per-entity gate
 * already enforce `row.teamId === ctx.teamId`. The explicit equality check
 * here documents the invariant and catches any future regression where a
 * code path forgets to pass the same teamContext through both gates.
 *
 * Throws 400 with a descriptive message (rather than uniform 404) because
 * the caller has already proven read access to both rows — the cross-scope
 * mismatch is a published business rule, not a hidden state.
 */
function assertTagEntityScopeMatch(
  tagTeamId: string | null,
  entityTeamId: string | null,
): void {
  if (tagTeamId !== entityTeamId) {
    throw new AppError(
      "Tag and entity must belong to the same scope (both personal or both on the same team)",
      400,
    );
  }
}

/**
 * Phase 6 P5.5.b — canonical audit log line for tag attach/detach across
 * all four entity types. Field naming matches the booking.* / task.reorder
 * audit conventions established in prior chunks.
 */
function logTagJunction(
  action: "attach" | "detach",
  fields: {
    actorId: string;
    tagId: string;
    entityType: EntityType;
    entityId: string;
    teamId: string | null;
  },
): void {
  logger.info(`tag.${action}`, { action, ...fields });
}

// ────────────────────────────────────────────────────────────
// Scope + access helpers
// ────────────────────────────────────────────────────────────

/**
 * Phase 6 P5.5.a — Prisma `where` fragment scoping a Tag query to the
 * actor's allowed visibility under the current team context.
 *
 * - Personal (`teamContext === null`): actor-owned **personal** tags only.
 *   The `teamId: null` clause is load-bearing: without it, an actor's
 *   team tags (created while wearing the ADMIN/OWNER hat) would leak into
 *   their personal `GET /tags`. Same bug class as prior chunks.
 * - Team + any role: every team tag — tags are workspace primitives.
 *   ALL members see ALL team tags (asymmetric vs cards where MEMBER sees
 *   own-only). Justification: tags are a shared vocabulary; hiding tags
 *   between members defeats the workspace model.
 */
function tagScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.TagWhereInput {
  if (teamContext === null) {
    return { teamId: null, userId: actorId };
  }
  return { teamId: teamContext.teamId };
}

/**
 * Pure access check on a pre-fetched slim row. Uniform 404 on any failure.
 *
 * Mode semantics:
 *   - `read`: tag must be in actor's visible scope (personal own; or any
 *     team tag for any team role).
 *   - `mutate`: same scope check + ADMIN/OWNER required for team tags.
 *     Personal tags require own-only.
 *
 * The mutate→404 (not 403) for MEMBERs on team tags is intentional:
 * collapsing the role oracle keeps the access surface uniform with the
 * not-found / wrong-scope paths.
 */
function verifyTagAccess(
  actorId: string,
  tag: TagForAccess,
  teamContext: TeamContext | null,
  mode: "read" | "mutate",
): void {
  if (teamContext === null) {
    if (tag.teamId !== null || tag.userId !== actorId) {
      throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
    }
    return;
  }
  if (tag.teamId !== teamContext.teamId) {
    throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
  }
  if (
    mode === "mutate" &&
    teamContext.role !== "ADMIN" &&
    teamContext.role !== "OWNER"
  ) {
    // Uniform 404 — no role-leak oracle.
    throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
  }
}

/**
 * Slim fetch + verify access + return. Mirrors assertMeetingAccess /
 * assertCardAccess / assertTaskAccess / assertEventTypeAccess.
 *
 * Exported so the P5.5.b junction handlers (and the current bridge usage
 * in this file) can swap from the legacy `verifyTagOwnership(tagId, userId)`
 * to a team-aware gate without further restructuring.
 */
export async function assertTagAccess(
  actorId: string,
  tagId: string,
  teamContext: TeamContext | null,
  mode: "read" | "mutate",
): Promise<TagForAccess> {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, isDeleted: false },
    select: { id: true, userId: true, teamId: true },
  });
  if (!tag) throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
  verifyTagAccess(actorId, tag, teamContext, mode);
  return tag;
}

// ────────────────────────────────────────────────────────────
// Tag CRUD
// ────────────────────────────────────────────────────────────

/**
 * Phase 6 P5.5.a — list tags + per-domain counts.
 *
 * Counts are workspace-wide under team ctx (every team member, including
 * MEMBER, sees the same count). Acceptable as workspace-level metadata —
 * the count surfaces tag activity, individual access still requires the
 * per-entity gate. Matches how Slack channel counts work.
 */
export async function listTags(
  userId: string,
  teamContext: TeamContext | null = null,
) {
  const tagWhere: Prisma.TagWhereInput = {
    isDeleted: false,
    ...tagScope(userId, teamContext),
  };

  // Entity-side scope for the count queries. Mirrors the per-domain
  // *Scope helpers but expressed inline so we don't have to depend on
  // every other service.
  const meetingScope: Prisma.MeetingWhereInput =
    teamContext === null
      ? { createdById: userId, teamId: null, isDeleted: false }
      : { teamId: teamContext.teamId, isDeleted: false };

  const cardScope: Prisma.CardWhereInput =
    teamContext === null
      ? { userId, teamId: null, isDeleted: false }
      : { teamId: teamContext.teamId, isDeleted: false };

  const taskScope: Prisma.TaskWhereInput =
    teamContext === null
      ? { userId, teamId: null, isDeleted: false }
      : { teamId: teamContext.teamId, isDeleted: false };

  // Contacts route through their parent card's scope.
  const contactScope: Prisma.CardContactWhereInput =
    teamContext === null
      ? { card: { userId, teamId: null, isDeleted: false } }
      : { card: { teamId: teamContext.teamId, isDeleted: false } };

  const [tags, meetingCounts, cardCounts, taskCounts, contactCounts] =
    await Promise.all([
      prisma.tag.findMany({
        where: tagWhere,
        select: TAG_SELECT,
        orderBy: { name: "asc" },
        take: 500,
      }),
      prisma.meetingTag.groupBy({
        by: ["tagId"],
        where: { tag: tagWhere, meeting: meetingScope },
        _count: { _all: true },
      }),
      prisma.cardTag.groupBy({
        by: ["tagId"],
        where: { tag: tagWhere, card: cardScope },
        _count: { _all: true },
      }),
      prisma.taskTag.groupBy({
        by: ["tagId"],
        where: { tag: tagWhere, task: taskScope },
        _count: { _all: true },
      }),
      prisma.contactTag.groupBy({
        by: ["tagId"],
        where: { tag: tagWhere, contact: contactScope },
        _count: { _all: true },
      }),
    ]);

  const meetingCountsByTag = new Map(
    meetingCounts.map((row) => [row.tagId, row._count._all]),
  );
  const cardCountsByTag = new Map(
    cardCounts.map((row) => [row.tagId, row._count._all]),
  );
  const taskCountsByTag = new Map(
    taskCounts.map((row) => [row.tagId, row._count._all]),
  );
  const contactCountsByTag = new Map(
    contactCounts.map((row) => [row.tagId, row._count._all]),
  );

  return tags.map((tag) => ({
    ...tag,
    _count: {
      meetingTags: meetingCountsByTag.get(tag.id) ?? 0,
      cardTags: cardCountsByTag.get(tag.id) ?? 0,
      taskTags: taskCountsByTag.get(tag.id) ?? 0,
      contactTags: contactCountsByTag.get(tag.id) ?? 0,
    },
  }));
}

/**
 * Phase 6 P5.5.a — create a tag. MEMBER may create team tags under team
 * ctx (asymmetric vs createCard); tags are workspace primitives.
 *
 * Team tag count capped at MAX_TAGS_PER_TEAM to prevent namespace pollution.
 */
export async function createTag(
  userId: string,
  data: CreateTagInput,
  teamContext: TeamContext | null = null,
) {
  // Defensive cap on team-tag count (security-reviewer must-fix). Personal
  // tags stay uncapped.
  if (teamContext !== null) {
    const existing = await prisma.tag.count({
      where: { teamId: teamContext.teamId, isDeleted: false },
    });
    if (existing >= MAX_TAGS_PER_TEAM) {
      throw new AppError(
        `Team has reached the maximum of ${MAX_TAGS_PER_TEAM} tags`,
        409,
      );
    }
  }

  try {
    return await prisma.tag.create({
      data: {
        userId,
        teamId: teamContext?.teamId ?? null,
        name: data.name,
        color: data.color ?? DEFAULT_TAG_COLOR,
      },
      select: TAG_SELECT,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("A tag with this name already exists", 409);
    }
    throw err;
  }
}

/**
 * Phase 6 P5.5.a — update a tag.
 *
 * Personal: own-only. Team: ADMIN/OWNER only (mutate gate). Uses
 * `updateMany` with full scope filter — closes the TOCTOU between the
 * gate slim-fetch and the actual update (security-reviewer must-fix).
 */
export async function updateTag(
  userId: string,
  tagId: string,
  data: UpdateTagInput,
  teamContext: TeamContext | null = null,
) {
  await assertTagAccess(userId, tagId, teamContext, "mutate");

  try {
    const result = await prisma.tag.updateMany({
      where: {
        id: tagId,
        isDeleted: false,
        ...tagScope(userId, teamContext),
      },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
      },
    });
    if (result.count === 0) {
      // Lost the race vs a concurrent delete/team-reassignment.
      throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
    }
    const updated = await prisma.tag.findUnique({
      where: { id: tagId },
      select: TAG_SELECT,
    });
    if (!updated) throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
    return updated;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError("A tag with this name already exists", 409);
    }
    throw err;
  }
}

/**
 * Phase 6 P5.5.a — soft-delete a tag and clean junction rows in a single
 * transaction. Same TOCTOU defence as updateTag.
 */
export async function deleteTag(
  userId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  await assertTagAccess(userId, tagId, teamContext, "mutate");

  await prisma.$transaction(
    async (tx) => {
      const result = await tx.tag.updateMany({
        where: {
          id: tagId,
          isDeleted: false,
          ...tagScope(userId, teamContext),
        },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      if (result.count === 0) {
        throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);
      }

      // Remove all junction rows. Cascade by-tagId is owner-agnostic by
      // design — the access gate has already verified mutate rights.
      await tx.meetingTag.deleteMany({ where: { tagId } });
      await tx.cardTag.deleteMany({ where: { tagId } });
      await tx.taskTag.deleteMany({ where: { tagId } });
      await tx.contactTag.deleteMany({ where: { tagId } });
    },
    { timeout: 15000 },
  );

  logger.info("tag.delete", {
    actorId: userId,
    tagId,
    teamId: teamContext?.teamId ?? null,
  });
}

/**
 * Phase 6 P5.5.a — list every entity tagged with a given tag.
 *
 * Read gate enforces scope (any team role can read; personal must own).
 * Per-domain sub-queries scope by entity team-scope, matching listTags
 * counts. Items reflect workspace activity; per-entity access is gated
 * elsewhere.
 */
export async function getTagItems(
  userId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  await assertTagAccess(userId, tagId, teamContext, "read");

  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    select: TAG_SELECT,
  });
  if (!tag) throw new AppError(TAG_NOT_FOUND_MESSAGE, 404);

  const meetingScope: Prisma.MeetingWhereInput =
    teamContext === null
      ? { createdById: userId, teamId: null, isDeleted: false }
      : { teamId: teamContext.teamId, isDeleted: false };

  const cardScope: Prisma.CardWhereInput =
    teamContext === null
      ? { userId, teamId: null, isDeleted: false }
      : { teamId: teamContext.teamId, isDeleted: false };

  const taskScope: Prisma.TaskWhereInput =
    teamContext === null
      ? { userId, teamId: null, isDeleted: false }
      : { teamId: teamContext.teamId, isDeleted: false };

  const contactScope: Prisma.CardContactWhereInput =
    teamContext === null
      ? { card: { userId, teamId: null, isDeleted: false } }
      : { card: { teamId: teamContext.teamId, isDeleted: false } };

  const [meetingTags, cardTags, taskTags, contactTags] = await Promise.all([
    prisma.meetingTag.findMany({
      where: { tagId, meeting: meetingScope },
      select: {
        meeting: {
          select: {
            id: true,
            title: true,
            startTime: true,
            type: true,
            status: true,
          },
        },
      },
      take: 100,
    }),
    prisma.cardTag.findMany({
      where: { tagId, card: cardScope },
      select: {
        card: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            title: true,
            avatarUrl: true,
          },
        },
      },
      take: 100,
    }),
    prisma.taskTag.findMany({
      where: { tagId, task: taskScope },
      select: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
          },
        },
      },
      take: 100,
    }),
    prisma.contactTag.findMany({
      where: { tagId, contact: contactScope },
      select: {
        contact: {
          select: {
            id: true,
            name: true,
            company: true,
            cardId: true,
          },
        },
      },
      take: 100,
    }),
  ]);

  const meetings = meetingTags.map((t) => t.meeting);
  const cards = cardTags.map((t) => t.card);
  const tasks = taskTags.map((t) => t.task);
  const contacts = contactTags.map((t) => t.contact);

  return {
    tag,
    meetings,
    cards,
    tasks,
    contacts,
    counts: {
      meetings: meetings.length,
      cards: cards.length,
      tasks: tasks.length,
      contacts: contacts.length,
      total: meetings.length + cards.length + tasks.length + contacts.length,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Meeting tags
// ────────────────────────────────────────────────────────────
//
// Phase 6 P5.5.a bridge — junction handlers now route the tag-side check
// through `assertTagAccess(..., "read")` so team tags created by member A
// can be attached by member B. Entity-side checks
// (verifyCardOwnership / verifyTaskOwnership / verifyContactOwnership)
// stay as-is — the full swap to assertCardAccess / assertTaskAccess /
// assertContactBelongsToCard lands in P5.5.b alongside cross-scope guards
// (tag.teamId must equal entity.teamId).

export async function getMeetingTags(
  userId: string,
  meetingId: string,
  teamContext: TeamContext | null = null,
) {
  await assertMeetingAccess(userId, meetingId, teamContext, "read");

  const rows = await prisma.meetingTag.findMany({
    where: { meetingId, tag: { isDeleted: false } },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToMeeting(
  userId: string,
  meetingId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  const [meeting, tag] = await Promise.all([
    assertMeetingAccess(userId, meetingId, teamContext, "mutate"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);
  assertTagEntityScopeMatch(tag.teamId, meeting.teamId);

  await prisma.meetingTag.upsert({
    where: { meetingId_tagId: { meetingId, tagId } },
    create: { meetingId, tagId },
    update: {},
  });

  logTagJunction("attach", {
    actorId: userId,
    tagId,
    entityType: "meeting",
    entityId: meetingId,
    teamId: teamContext?.teamId ?? null,
  });
}

export async function detachTagFromMeeting(
  userId: string,
  meetingId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  // Detach is symmetric — both gates still required so a MEMBER can't
  // remove a team tag they shouldn't be able to see in the first place.
  // Cross-scope guard skipped for detach: if a stale junction row exists
  // across scopes (shouldn't happen post-P5.5.b), the delete is a no-op.
  await Promise.all([
    assertMeetingAccess(userId, meetingId, teamContext, "mutate"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);

  await prisma.meetingTag.deleteMany({ where: { meetingId, tagId } });

  logTagJunction("detach", {
    actorId: userId,
    tagId,
    entityType: "meeting",
    entityId: meetingId,
    teamId: teamContext?.teamId ?? null,
  });
}

// ────────────────────────────────────────────────────────────
// Card tags  (Phase 6 P5.5.b — assertCardAccess swap + cross-scope guard)
// ────────────────────────────────────────────────────────────

export async function getCardTags(
  userId: string,
  cardId: string,
  teamContext: TeamContext | null = null,
) {
  await assertCardAccess(userId, cardId, teamContext, "read");

  const rows = await prisma.cardTag.findMany({
    where: { cardId, tag: { isDeleted: false } },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToCard(
  userId: string,
  cardId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  const [card, tag] = await Promise.all([
    assertCardAccess(userId, cardId, teamContext, "read"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);
  assertTagEntityScopeMatch(tag.teamId, card.teamId);

  await prisma.cardTag.upsert({
    where: { cardId_tagId: { cardId, tagId } },
    create: { cardId, tagId },
    update: {},
  });

  logTagJunction("attach", {
    actorId: userId,
    tagId,
    entityType: "card",
    entityId: cardId,
    teamId: teamContext?.teamId ?? null,
  });
}

export async function detachTagFromCard(
  userId: string,
  cardId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  await Promise.all([
    assertCardAccess(userId, cardId, teamContext, "read"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);

  await prisma.cardTag.deleteMany({ where: { cardId, tagId } });

  logTagJunction("detach", {
    actorId: userId,
    tagId,
    entityType: "card",
    entityId: cardId,
    teamId: teamContext?.teamId ?? null,
  });
}

// ────────────────────────────────────────────────────────────
// Task tags  (Phase 6 P5.5.b — assertTaskAccess swap + cross-scope guard)
// ────────────────────────────────────────────────────────────

export async function getTaskTags(
  userId: string,
  taskId: string,
  teamContext: TeamContext | null = null,
) {
  await assertTaskAccess(userId, taskId, teamContext, "read");

  const rows = await prisma.taskTag.findMany({
    where: { taskId, tag: { isDeleted: false } },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToTask(
  userId: string,
  taskId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  const [task, tag] = await Promise.all([
    assertTaskAccess(userId, taskId, teamContext, "read"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);
  assertTagEntityScopeMatch(tag.teamId, task.teamId);

  await prisma.taskTag.upsert({
    where: { taskId_tagId: { taskId, tagId } },
    create: { taskId, tagId },
    update: {},
  });

  logTagJunction("attach", {
    actorId: userId,
    tagId,
    entityType: "task",
    entityId: taskId,
    teamId: teamContext?.teamId ?? null,
  });
}

export async function detachTagFromTask(
  userId: string,
  taskId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  await Promise.all([
    assertTaskAccess(userId, taskId, teamContext, "read"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);

  await prisma.taskTag.deleteMany({ where: { taskId, tagId } });

  logTagJunction("detach", {
    actorId: userId,
    tagId,
    entityType: "task",
    entityId: taskId,
    teamId: teamContext?.teamId ?? null,
  });
}

// ────────────────────────────────────────────────────────────
// Contact tags  (Phase 6 P5.5.b — assertCardAccess + contact-belongs-to-card)
// ────────────────────────────────────────────────────────────
//
// Contacts are children of cards (the route shape `/cards/:cardId/contacts/
// :contactId/tags/:tagId` reflects this). Access is gated by:
//   1. `assertCardAccess(read)` on the parent card — covers personal own /
//      team scope / MEMBER own-only.
//   2. `verifyContactBelongsToCard` — confirms the contactId is actually a
//      live row under the card. Without this, an actor with access to
//      card A could read tags off a contact attached to card B.
// The cross-scope guard then uses the parent card's `teamId` because
// `CardContact` has no `teamId` of its own; the contact's scope is the
// card's scope.

async function verifyContactBelongsToCard(
  cardId: string,
  contactId: string,
): Promise<void> {
  const contact = await prisma.cardContact.findFirst({
    where: { id: contactId, cardId, isDeleted: false },
    select: { id: true },
  });
  if (!contact) throw new AppError("Contact not found", 404);
}

export async function getContactTags(
  userId: string,
  cardId: string,
  contactId: string,
  teamContext: TeamContext | null = null,
) {
  await assertCardAccess(userId, cardId, teamContext, "read");
  await verifyContactBelongsToCard(cardId, contactId);

  const rows = await prisma.contactTag.findMany({
    where: {
      contactId,
      tag: { isDeleted: false },
    },
    select: {
      createdAt: true,
      tag: { select: TAG_SELECT },
    },
    orderBy: { tag: { name: "asc" } },
  });

  return rows.map((r) => ({ ...r.tag, attachedAt: r.createdAt }));
}

export async function attachTagToContact(
  userId: string,
  cardId: string,
  contactId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  const [card, tag] = await Promise.all([
    assertCardAccess(userId, cardId, teamContext, "read"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);
  await verifyContactBelongsToCard(cardId, contactId);
  // Contact inherits its scope from the parent card; tag must match.
  assertTagEntityScopeMatch(tag.teamId, card.teamId);

  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId } },
    create: { contactId, tagId },
    update: {},
  });

  logTagJunction("attach", {
    actorId: userId,
    tagId,
    entityType: "contact",
    entityId: contactId,
    teamId: teamContext?.teamId ?? null,
  });
}

export async function detachTagFromContact(
  userId: string,
  cardId: string,
  contactId: string,
  tagId: string,
  teamContext: TeamContext | null = null,
) {
  await Promise.all([
    assertCardAccess(userId, cardId, teamContext, "read"),
    assertTagAccess(userId, tagId, teamContext, "read"),
  ]);
  await verifyContactBelongsToCard(cardId, contactId);

  await prisma.contactTag.deleteMany({ where: { contactId, tagId } });

  logTagJunction("detach", {
    actorId: userId,
    tagId,
    entityType: "contact",
    entityId: contactId,
    teamId: teamContext?.teamId ?? null,
  });
}
