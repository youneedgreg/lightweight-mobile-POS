/**
 * Creates the first admin user (idempotent).
 * Usage: pnpm db:seed   (reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env.local)
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neonConfig, Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "../src/db/schema";

neonConfig.webSocketConstructor = ws;

async function main() {
  const { DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = process.env;
  if (!DATABASE_URL || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error("DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }
  if (SEED_ADMIN_PASSWORD.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle({ client: pool, schema });

  const email = SEED_ADMIN_EMAIL.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });

  if (existing) {
    console.log(`Admin ${email} already exists — skipping.`);
  } else {
    await db.insert(schema.users).values({
      email,
      name: SEED_ADMIN_NAME ?? "Owner",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(SEED_ADMIN_PASSWORD, 12),
    });
    console.log(`Created admin ${email}.`);
  }

  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
