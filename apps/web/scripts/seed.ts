/**
 * Creates the first admin user, and optionally a test cashier (idempotent).
 * Usage: pnpm db:seed   (reads SEED_* variables from .env.local)
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { normalizeKenyanPhone } from "@liquor-pos/shared";
import { neonConfig, Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "../src/db/schema";

neonConfig.webSocketConstructor = ws;

async function main() {
  const env = process.env;
  if (!env.DATABASE_URL || !env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    throw new Error("DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }
  if (env.SEED_ADMIN_PASSWORD.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });

  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  if (await db.query.users.findFirst({ where: eq(schema.users.email, email) })) {
    console.log(`Admin ${email} already exists — skipping.`);
  } else {
    await db.insert(schema.users).values({
      email,
      name: env.SEED_ADMIN_NAME ?? "Owner",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12),
    });
    console.log(`Created admin ${email}.`);
  }

  if (env.SEED_CASHIER_PHONE && env.SEED_CASHIER_PIN) {
    const phone = normalizeKenyanPhone(env.SEED_CASHIER_PHONE);
    if (!phone) throw new Error("SEED_CASHIER_PHONE is not a valid Kenyan phone number");
    if (await db.query.users.findFirst({ where: eq(schema.users.phone, phone) })) {
      console.log(`Cashier ${phone} already exists — skipping.`);
    } else {
      await db.insert(schema.users).values({
        phone,
        name: env.SEED_CASHIER_NAME ?? "Test Cashier",
        role: "CASHIER",
        pinHash: await bcrypt.hash(env.SEED_CASHIER_PIN, 12),
      });
      console.log(`Created cashier ${phone}.`);
    }
  }

  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
