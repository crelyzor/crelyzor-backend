/**
 * Backfill script: Generate htmlContent + htmlBackContent for existing cards.
 *
 * Usage:
 *   npx tsx prisma/scripts/backfillCardHtml.ts
 *
 * This script finds all cards with htmlContent = null, generates HTML from the
 * template engine, and updates each card in the database.
 */

import { PrismaClient } from "@prisma/client";
import { renderCardHtml } from "../../src/templates/renderCard";
import type {
  TemplateId,
  CardTemplateData,
} from "../../src/templates/cardTemplates";

const prisma = new PrismaClient();

const CARDS_PUBLIC_URL =
  process.env.CARDS_PUBLIC_URL || "http://localhost:5174";

interface CardLink {
  type: string;
  url: string;
  label: string;
}

interface CardContactFields {
  phone?: string;
  email?: string;
  location?: string;
  website?: string;
  bookingUrl?: string;
}

interface CardTheme {
  primaryColor?: string;
}

function buildPublicUrl(
  username: string,
  slug: string,
  isDefault: boolean,
): string {
  if (isDefault) return `${CARDS_PUBLIC_URL}/${username}`;
  return `${CARDS_PUBLIC_URL}/${username}/${slug}`;
}

async function main() {
  // Find all cards without generated HTML, include user for username
  const cards = await prisma.card.findMany({
    where: { htmlContent: null },
    include: { user: { select: { username: true } } },
  });

  console.log(`Found ${cards.length} cards to backfill.\n`);

  let success = 0;
  let failed = 0;

  for (const card of cards) {
    const username = card.user?.username;
    if (!username) {
      console.log(`  SKIP card ${card.id} — no username found`);
      failed++;
      continue;
    }

    const templateId = (card.templateId || "executive") as TemplateId;
    const theme = (card.theme ?? {}) as CardTheme;
    const links = (card.links ?? []) as CardLink[];
    const contactFields = (card.contactFields ?? {}) as CardContactFields;
    const publicUrl = buildPublicUrl(username, card.slug, card.isDefault);

    const templateData: CardTemplateData = {
      displayName: card.displayName,
      title: card.title,
      bio: card.bio,
      avatarUrl: card.avatarUrl,
      links,
      contactFields,
      accentColor: theme.primaryColor || "#d4af61",
      publicUrl,
      showQr: card.showQr ?? true,
    };

    try {
      const { htmlContent, htmlBackContent } = await renderCardHtml(
        templateId,
        templateData,
      );

      await prisma.card.update({
        where: { id: card.id },
        data: { htmlContent, htmlBackContent, templateId },
      });

      success++;
      console.log(
        `  OK   card ${card.id} (${card.displayName}) — template: ${templateId}`,
      );
    } catch (err) {
      failed++;
      console.error(`  FAIL card ${card.id}:`, err);
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
