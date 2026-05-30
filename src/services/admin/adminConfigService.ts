/**
 * Phase 6 P8 — SystemConfig admin service.
 *
 * SystemConfig is a key/value store editable from the admin portal. Keys are
 * free-form lowercase identifiers like `max_teams_per_pro_user`. Values are
 * strings; consumers cast at read-time (see `readSystemConfigNumber` in
 * teamInviteService for the pattern).
 *
 * Audit: every mutation logs `admin.config.update` with `{adminId, key,
 * previousValue, value}`. SystemConfig has a built-in `updatedBy` column —
 * we populate it from `req.adminId`.
 */
import prisma from "../../db/prismaClient";
import { logger } from "../../utils/logging/logger";

export interface SystemConfigEntry {
  key: string;
  value: string;
  category: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns all SystemConfig rows grouped by category. Category is derived
 * from the key prefix (text before the first `_`). Used to render the
 * admin portal's grouped config editor.
 */
export async function listConfig(): Promise<{
  entries: SystemConfigEntry[];
  grouped: Record<string, SystemConfigEntry[]>;
}> {
  const rows = await prisma.systemConfig.findMany({
    orderBy: { key: "asc" },
  });

  const entries: SystemConfigEntry[] = rows.map((row) => {
    const underscore = row.key.indexOf("_");
    const category = underscore > 0 ? row.key.slice(0, underscore) : "general";
    return {
      key: row.key,
      value: row.value,
      category,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  const grouped = entries.reduce<Record<string, SystemConfigEntry[]>>(
    (acc, entry) => {
      acc[entry.category] = acc[entry.category] ?? [];
      acc[entry.category].push(entry);
      return acc;
    },
    {},
  );

  return { entries, grouped };
}

/**
 * Upserts a SystemConfig row. Allows creating new keys — admins can add
 * keys at runtime. Reads in app code always fall through `readSystemConfigNumber`
 * or similar with a fallback default, so a brand-new key never breaks
 * runtime.
 */
export async function updateConfig(
  key: string,
  value: string,
  adminId: string,
): Promise<SystemConfigEntry> {
  const previous = await prisma.systemConfig.findUnique({ where: { key } });

  const row = await prisma.systemConfig.upsert({
    where: { key },
    create: { key, value, updatedBy: adminId },
    update: { value, updatedBy: adminId },
  });

  logger.info("admin.config.update", {
    adminId,
    key,
    previousValue: previous?.value ?? null,
    value,
  });

  const underscore = row.key.indexOf("_");
  const category = underscore > 0 ? row.key.slice(0, underscore) : "general";

  return {
    key: row.key,
    value: row.value,
    category,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
