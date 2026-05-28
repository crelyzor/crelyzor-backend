/**
 * Orchestrates the Phase 5 migration:
 *   1. Apply M1 (20260522000000_phase5_encryption_at_rest) — additive schema
 *   2. Run the backfill — encrypts plaintext into staging columns
 *   3. Apply M2 (20260522000001_phase5_encryption_swap)    — drop + rename
 *
 * Using this wrapper avoids the destructive single-step migration. If you run
 * `pnpm prisma migrate deploy` directly with both migrations pending, M2 will
 * fail-fast because the staging columns are not yet populated — so the wrapper
 * is the supported path.
 *
 * Idempotent: re-running after a partial completion picks up where it left off.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(__dirname, "../../");
const MIGRATIONS_DIR = path.join(ROOT, "prisma/migrations");
const M1 = "20260522000000_phase5_encryption_at_rest";
const M2 = "20260522000001_phase5_encryption_swap";

const prisma = new PrismaClient();

function sh(cmd: string) {
  console.log(`\n▶  ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

async function isApplied(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    name,
  );
  return rows.length > 0;
}

async function applyMigrationSql(name: string) {
  const file = path.join(MIGRATIONS_DIR, name, "migration.sql");
  if (!fs.existsSync(file)) {
    throw new Error(`Migration file not found: ${file}`);
  }
  sh(`pnpm prisma db execute --file "${file}" --schema prisma/schema.prisma`);
  sh(`pnpm prisma migrate resolve --applied ${name}`);
}

async function main() {
  if (!(await isApplied(M1))) {
    console.log(`\n── Step 1: applying ${M1} (additive) ──`);
    await applyMigrationSql(M1);
  } else {
    console.log(`\n── Step 1: ${M1} already applied — skipping ──`);
  }

  console.log("\n── Step 2: running backfill ──");
  sh("pnpm tsx src/scripts/phase5Backfill.ts");

  if (!(await isApplied(M2))) {
    console.log(`\n── Step 3: applying ${M2} (swap) ──`);
    await applyMigrationSql(M2);
  } else {
    console.log(`\n── Step 3: ${M2} already applied — skipping ──`);
  }

  console.log("\n✓  Phase 5 migration complete.");
}

main()
  .catch((err) => {
    console.error("\n✗  Phase 5 migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
