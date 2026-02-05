/**
 * Script to test the notification service by sending a test email
 *
 * Usage: npx ts-node src/scripts/testNotification.ts
 * Or via tsx: npx tsx src/scripts/testNotification.ts
 */

import { sendTestingMail } from "../utils/notificationServiceUtils";
import prisma from "../db/prismaClient";

async function main() {
  console.log("=== Testing Notification Service ===\n");

  // Fetch a real organization from the database
  const org = await prisma.organization.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (!org) {
    console.error(
      "❌ No organization found in database. Please create one first.",
    );
    process.exit(1);
  }

  console.log(`Using organization: ${org.name} (${org.id})\n`);

  // Send test email to the specified address
  await sendTestingMail(
    org.id, // Use real org ID
    "msachdeva9april@gmail.com",
    "Mayank Sachdeva",
  );

  console.log("\n=== Test Complete ===");
  console.log("Check msachdeva9april@gmail.com for the test email.");

  // Disconnect Prisma
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Error running test:", error);
  await prisma.$disconnect();
  process.exit(1);
});
