import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME ?? "Admin";

  if (!email || !password) {
    console.error("❌  ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env.local");
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓  Admin already exists: ${email} — skipping`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.adminUser.create({
    data: { email, passwordHash, name },
  });

  console.log(`✓  Admin created: ${admin.email} (id: ${admin.id})`);
  console.log("   You can now delete ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, and ADMIN_SEED_NAME from your env.");
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
