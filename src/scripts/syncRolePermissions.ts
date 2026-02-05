/**
 * Sync Role Permissions Script
 *
 * Ensures that for every organization, each system role has the permissions
 * defined in the role-permission map from assignRoles.ts.
 *
 * Run: npx ts-node src/scripts/syncRolePermissions.ts
 */

import prisma from "../db/prismaClient";
import { Prisma, UserRoleEnum } from "@prisma/client";
import { getDefaultPermissionsForRole } from "../utils/assignRoles";

async function syncOrg(
  orgId: string,
  tx: Prisma.TransactionClient | typeof prisma,
) {
  const roleTypes = Object.values(UserRoleEnum);

  for (const roleType of roleTypes) {
    const role = await tx.role.findFirst({
      where: {
        orgId,
        systemRoleType: roleType,
        isSystemRole: true,
        isActive: true,
      },
      include: {
        permissions: true,
      },
    });

    if (!role) {
      console.warn(
        `[syncRolePermissions] Skipping missing role ${roleType} for org ${orgId}`,
      );
      continue;
    }

    // Fetch or create the default permissions for this role
    const defaultPerms = await getDefaultPermissionsForRole(roleType, tx);
    const existingIds = new Set(role.permissions.map((p) => p.id));
    const missing = defaultPerms.filter((p) => !existingIds.has(p.id));

    if (missing.length === 0) {
      console.log(
        `[syncRolePermissions] Role ${roleType} already has all permissions in org ${orgId}`,
      );
      continue;
    }

    await tx.role.update({
      where: { id: role.id },
      data: {
        permissions: {
          connect: missing.map((p) => ({ id: p.id })),
        },
      },
    });

    console.log(
      `[syncRolePermissions] Connected ${missing.length} permissions to role ${roleType} in org ${orgId}`,
    );
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { orgId?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--org" && args[i + 1]) {
      out.orgId = args[i + 1];
      i++;
    } else if (a.startsWith("--org=")) {
      out.orgId = a.split("=")[1];
    }
  }
  return out;
}

async function main() {
  console.log("Starting Role Permission Sync...");
  const { orgId } = parseArgs();

  const orgs = await prisma.organization.findMany({
    where: orgId ? { id: orgId } : undefined,
    select: { id: true, name: true },
  });

  console.log(`Found ${orgs.length} organizations`);

  let processed = 0;
  for (const org of orgs) {
    console.log(`\nProcessing org: ${org.name} (${org.id})`);
    // Avoid long-running interactive transactions: operate per-role without wrapping
    // the entire organization in a single transaction to reduce timeout risk.
    await syncOrg(org.id, prisma);
    processed++;
  }

  console.log(`\nCompleted. Orgs processed: ${processed}`);
}

main()
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
