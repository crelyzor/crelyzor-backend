/**
 * Wrapper for `prisma studio` that loads .env.local first.
 * Prisma's CLI auto-loads .env but not .env.local — this script bridges that gap.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { spawn } from "child_process";

const child = spawn("pnpm", ["exec", "prisma", "studio"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
