export const TEMPLATE_IDS = [
  "executive",
  "classic-bold",
  "minimal",
  "classic-centered",
  "left-minimal",
  "editorial",
  "dark-luxury",
  "split-panel",
  "ghost-outline",
  "monogram-hero",
  "horizontal-bands",
  "full-bleed",
  "diagonal-split",
  "terminal",
  "atmospheric",
  "ruled",
  "circle",
  "light",
  "deconstructed",
  "extreme-minimal",
  "blueprint",
  "neon-edge",
  "textile",
  "brutalist",
  "y2k",
  "earthy",
  "soft-pastel",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type { CardTemplateData, TemplateRenderer } from "./helpers";

import { executive, classicBold, minimal } from "./cards/originals";
import {
  classicCentered,
  ghostOutline,
  circle,
  extremeMinimal,
} from "./cards/centered";
import { leftMinimal, splitPanel, horizontalBands } from "./cards/sideline";
import {
  editorial,
  monogramHero,
  fullBleed,
  deconstructed,
} from "./cards/typographic";
import { darkLuxury, atmospheric, neonEdge } from "./cards/glow";
import { terminal, ruled, textile } from "./cards/textured";
import { diagonalSplit, blueprint } from "./cards/geometric";
import { light, brutalist, y2k, earthy, softPastel } from "./cards/specialty";
import type { TemplateRenderer } from "./helpers";

export const templates: Record<TemplateId, TemplateRenderer> = {
  executive,
  "classic-bold": classicBold,
  minimal,
  "classic-centered": classicCentered,
  "left-minimal": leftMinimal,
  editorial,
  "dark-luxury": darkLuxury,
  "split-panel": splitPanel,
  "ghost-outline": ghostOutline,
  "monogram-hero": monogramHero,
  "horizontal-bands": horizontalBands,
  "full-bleed": fullBleed,
  "diagonal-split": diagonalSplit,
  terminal,
  atmospheric,
  ruled,
  circle,
  light,
  deconstructed,
  "extreme-minimal": extremeMinimal,
  blueprint,
  "neon-edge": neonEdge,
  textile,
  brutalist,
  y2k,
  earthy,
  "soft-pastel": softPastel,
};

export const templateList = Object.values(templates).map((t) => t.meta);
