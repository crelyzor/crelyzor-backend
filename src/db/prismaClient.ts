/**
 * @fileoverview Database connection utilities for Pinecone vector database and Prisma ORM.
 * @module database-connections
 *
 * @author RahulBhardwaj
 */

import { PrismaClient } from "@prisma/client";

/**
 * Creates a new Prisma client instance
 * @function prismaClientSingleton
 * @returns {PrismaClient} A new Prisma client instance
 */
const prismaClientSingleton = () => {
  return new PrismaClient();
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

/**
 * Global object with Prisma client for preventing multiple instances
 * @type {Object}
 * @property {PrismaClientSingleton|undefined} prisma - The Prisma client instance
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

/**
 * Export the Prisma client as the default export
 * @exports prisma
 */
export default prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
