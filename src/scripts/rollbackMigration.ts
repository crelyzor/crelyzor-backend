import prisma from "../db/prismaClient";

async function rollback() {
  console.log("🔄 Rolling back partial migration...\n");

  try {
    // Drop partially created tables
    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "_RoleToPermission" CASCADE',
    );
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "Role" CASCADE');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "UserRole" CASCADE');

    console.log("✅ Dropped partial tables\n");

    // Restore from backups
    console.log("📦 Restoring from backup...\n");
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "CustomRole" AS SELECT * FROM "CustomRole_backup"',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "RolePermissionTemplate" AS SELECT * FROM "RolePermissionTemplate_backup"',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "UserRole" AS SELECT * FROM "UserRole_backup"',
    );
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "RolePermission" AS SELECT * FROM "RolePermission_backup"',
    );

    console.log("✅ Restored from backup\n");

    // Clean up backup tables
    console.log("🧹 Cleaning up backup tables...\n");
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "CustomRole_backup"');
    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "RolePermissionTemplate_backup"',
    );
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "UserRole_backup"');
    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "RolePermission_backup"',
    );

    console.log("✅ Rollback complete!\n");
  } catch (error) {
    console.error("❌ Rollback failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

rollback();
