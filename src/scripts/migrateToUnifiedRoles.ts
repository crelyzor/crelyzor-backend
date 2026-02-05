/**
 * Migration Script: Unify Role System
 *
 * This script migrates from the old role system:
 * - CustomRole (for org-specific roles)
 * - RolePermissionTemplate (for system role templates)
 * - RolePermission (per-user permission instances)
 *
 * To the new simplified system:
 * - Role (single table for all roles, both system and custom)
 * - UserRole (simple assignment table)
 *
 * Run with: npx ts-node src/scripts/migrateToUnifiedRoles.ts
 */

import prisma from "../db/prismaClient";
import fs from "fs";
import path from "path";

async function runMigration() {
  console.log("🚀 Starting migration to unified role system...\n");

  try {
    // Step 1: Verify current state
    console.log("📊 Checking current database state...");
    const [customRoleCount, roleTemplateCount, userRoleCount] =
      await Promise.all([
        prisma.$queryRaw`SELECT COUNT(*) as count FROM "CustomRole"`.then(
          (r: any) => parseInt(r[0].count),
        ),
        prisma.$queryRaw`SELECT COUNT(*) as count FROM "RolePermissionTemplate"`.then(
          (r: any) => parseInt(r[0].count),
        ),
        prisma.$queryRaw`SELECT COUNT(*) as count FROM "UserRole"`.then(
          (r: any) => parseInt(r[0].count),
        ),
      ]);

    console.log(`   - CustomRoles: ${customRoleCount}`);
    console.log(`   - RolePermissionTemplates: ${roleTemplateCount}`);
    console.log(`   - UserRoles to migrate: ${userRoleCount}\n`);

    // Step 2: Read and execute migration SQL
    console.log("📝 Executing migration SQL...");
    const sqlPath = path.join(
      __dirname,
      "../../prisma/migrations/migration-to-unified-roles.sql",
    );
    const migrationSQL = fs.readFileSync(sqlPath, "utf-8");

    // Split SQL into individual statements and execute
    // Remove comments and split by semicolons
    const statements = migrationSQL
      .split("\n")
      .filter((line) => !line.trim().startsWith("--")) // Remove comment lines
      .join("\n")
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    console.log(`   - Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`   - Executing statement ${i + 1}/${statements.length}...`);
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (error: any) {
        console.error(`   ❌ Failed on statement ${i + 1}:`, error.message);
        throw error;
      }
    }

    console.log("\n✅ Migration SQL executed successfully\n");

    // Step 3: Verify new state
    console.log("🔍 Verifying migration results...");
    const [roleCount, newUserRoleCount, permissionLinkCount] =
      await Promise.all([
        prisma.$queryRaw`SELECT COUNT(*) as count FROM "Role"`.then((r: any) =>
          parseInt(r[0].count),
        ),
        prisma.$queryRaw`SELECT COUNT(*) as count FROM "UserRole"`.then(
          (r: any) => parseInt(r[0].count),
        ),
        prisma.$queryRaw`SELECT COUNT(*) as count FROM "_RoleToPermission"`.then(
          (r: any) => parseInt(r[0].count),
        ),
      ]);

    console.log(`   - New Roles created: ${roleCount}`);
    console.log(`   - New UserRoles migrated: ${newUserRoleCount}`);
    console.log(`   - Permission links created: ${permissionLinkCount}\n`);

    // Step 4: Data validation
    console.log("🔐 Validating data integrity...");

    const expectedRoles = customRoleCount + roleTemplateCount;
    if (roleCount < expectedRoles) {
      throw new Error(
        `Expected at least ${expectedRoles} roles, but found ${roleCount}`,
      );
    }

    if (newUserRoleCount !== userRoleCount) {
      console.warn(
        `⚠️  Warning: UserRole count mismatch. Old: ${userRoleCount}, New: ${newUserRoleCount}`,
      );
    } else {
      console.log("   ✓ All UserRoles migrated successfully");
    }

    // Step 5: Verify foreign key relationships
    const orphanedUserRoles = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "UserRole" ur
      LEFT JOIN "Role" r ON ur."roleId" = r."id"
      WHERE r."id" IS NULL
    `;

    if (parseInt(orphanedUserRoles[0].count) > 0) {
      throw new Error(
        `Found ${orphanedUserRoles[0].count} orphaned UserRoles without valid Role references`,
      );
    }

    console.log("   ✓ All foreign key relationships valid\n");

    console.log("🎉 Migration completed successfully!\n");
    console.log("Next steps:");
    console.log("1. Run: npx prisma generate");
    console.log("2. Update your application code to use the new schema");
    console.log("3. Test thoroughly before deploying to production\n");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.error("\nThe database may be in an inconsistent state.");
    console.error(
      "Please review the error and consider restoring from backup.\n",
    );
    process.exit(1);
  }
}

// Backup creation helper
async function createBackup() {
  console.log("💾 Creating backup of current role tables...\n");

  try {
    // Execute each backup command separately (Prisma doesn't support multiple statements)
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "CustomRole_backup" AS SELECT * FROM "CustomRole"',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "RolePermissionTemplate_backup" AS SELECT * FROM "RolePermissionTemplate"',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "UserRole_backup" AS SELECT * FROM "UserRole"',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "RolePermission_backup" AS SELECT * FROM "RolePermission"',
    );

    console.log("✅ Backup created successfully\n");
    return true;
  } catch (error) {
    console.error("❌ Failed to create backup:", error);
    return false;
  }
}

// Main execution
(async () => {
  console.log("═══════════════════════════════════════════");
  console.log("  Role System Migration Script");
  console.log("═══════════════════════════════════════════\n");

  // Optional: Create backup first
  const shouldBackup = process.argv.includes("--backup");
  if (shouldBackup) {
    const backupSuccess = await createBackup();
    if (!backupSuccess) {
      console.error("Cannot proceed without backup. Exiting...");
      process.exit(1);
    }
  }

  await runMigration();
  await prisma.$disconnect();
})();
