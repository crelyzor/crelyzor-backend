import { hashSync } from "bcrypt";
import prisma from "../db/prismaClient";

async function main() {
  if (!process.env.SERVICE_CLIENT_SECRET_KEY) {
    throw new Error(
      "SERVICE_CLIENT_SECRET_KEY is not defined in environment variables",
    );
  }
  await prisma.serviceClient.upsert({
    where: { clientId: "auth-core" },
    update: {},
    create: {
      clientId: "auth-core",
      clientSecret: hashSync(process.env.SERVICE_CLIENT_SECRET_KEY, 10),
      name: "Auth Core",
      scopes: ["read", "write"],
    },
  });

  console.log("Seeded:", "Auth Core Service Client");

  await prisma.serviceClient.upsert({
    where: { clientId: "notification-service" },
    update: {},
    create: {
      clientId: "notification-service",
      clientSecret: hashSync(process.env.SERVICE_CLIENT_SECRET_KEY, 10),
      name: "Notification Service",
      scopes: ["read", "write"],
    },
  });

  console.log("Seeded:", "Notification Service Client");

  await prisma.serviceClient.upsert({
    where: { clientId: "crm-service" },
    update: {
      clientSecret: hashSync("crm-service-secret-2024", 10),
      name: "CRM Backend Service",
    },
    create: {
      clientId: "crm-service",
      clientSecret: hashSync("crm-service-secret-2024", 10),
      name: "CRM Backend Service",
      scopes: ["read", "write"],
    },
  });

  console.log("Seeded:", "CRM Service Client");
}
//sd
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
