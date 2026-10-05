/**
 * Wipes ALL business data (sales, stock, products, customers, suppliers,
 * shifts, ledgers, devices, audit log) and every product photo in Blob, so
 * the system can be handed over empty. Keeps user accounts except the demo
 * logins (DEMO_OWNER_PHONE / DEMO_CASHIER_PHONE). Irreversible.
 *
 *   pnpm db:wipe-demo        dev branch
 *   pnpm db:wipe-demo:prod   production
 *
 * Without CONFIRM_WIPE it only prints what it would delete. To actually wipe,
 * set CONFIRM_WIPE to the database host it prints.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neonConfig, Pool } from "@neondatabase/serverless";
import { del, list } from "@vercel/blob";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "../src/db/schema";

neonConfig.webSocketConstructor = ws;

/** Child tables first, so foreign keys are never violated. */
const TABLES = [
  "audit_log",
  "empties_ledger_entry",
  "customer_ledger_entry",
  "supplier_ledger_entry",
  "stock_movement",
  "payment",
  "sale_item",
  "sale",
  "stock_intake_item",
  "stock_intake",
  "expense",
  "shift",
  "device",
  "product_unit",
  "product",
  "category",
  "customer",
  "supplier",
] as const;

async function main() {
  const env = process.env;
  const production = env.DB_TARGET === "production";
  const url = production ? env.PROD_DATABASE_URL_UNPOOLED : env.DATABASE_URL;
  if (!url) throw new Error("Database URL not set");
  const host = new URL(url).hostname.replace("-pooler", "");
  const demoPhones = [env.DEMO_OWNER_PHONE, env.DEMO_CASHIER_PHONE].filter((p): p is string => Boolean(p));

  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  console.log(`Target: ${production ? "PRODUCTION" : "dev"} database ${host}`);
  for (const table of TABLES) {
    const [row] = (await db.execute<{ count: number }>(sql.raw(`select count(*)::int as count from "${table}"`))).rows;
    console.log(`  ${table.padEnd(24)} ${row?.count ?? 0} rows`);
  }
  const demoUsers = demoPhones.length
    ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.phone, demoPhones))
    : [];
  console.log(`  demo users to remove:    ${demoUsers.map((u) => u.name).join(", ") || "none"}`);
  const blobs = env.BLOB_READ_WRITE_TOKEN ? (await list({ prefix: "products/", limit: 1000 })).blobs : [];
  console.log(`  product photos in Blob:  ${blobs.length}`);

  if (env.CONFIRM_WIPE !== host) {
    console.log(`\nDry run. To wipe, run again with CONFIRM_WIPE=${host}`);
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    for (const table of TABLES) await tx.execute(sql.raw(`delete from "${table}"`));
    if (demoUsers.length) {
      await tx.delete(schema.users).where(inArray(schema.users.id, demoUsers.map((u) => u.id)));
    }
  });
  if (blobs.length) await del(blobs.map((b) => b.url));
  console.log("\nWiped. Remaining accounts:");
  for (const u of await db.select({ name: schema.users.name, role: schema.users.role, email: schema.users.email, phone: schema.users.phone }).from(schema.users)) {
    console.log(`  ${u.role.padEnd(8)} ${u.name ?? ""} ${u.email ?? ""} ${u.phone ?? ""}`);
  }
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
