/**
 * Fills a database with a demo catalog (products, crates, customers, a supplier,
 * opening stock) and two demo logins for showing the POS. Idempotent.
 *
 *   pnpm db:seed:demo        dev branch
 *   pnpm db:seed:demo:prod   production — only with ALLOW_PRODUCTION_DEMO=yes,
 *                            for a demonstration that `pnpm db:wipe-demo:prod` removes later
 *
 * Demo logins come from DEMO_OWNER_PHONE/PIN and DEMO_CASHIER_PHONE/PIN when set.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neonConfig, Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "../src/db/schema";

neonConfig.webSocketConstructor = ws;

const host = (url: string | undefined) => (url ? new URL(url).hostname.replace("-pooler", "") : null);

interface DemoProduct {
  name: string;
  size: string;
  category: string;
  barcode: string;
  retail: number;
  wholesale: number | null;
  cost: number;
  stock: number;
  returnable?: { deposit: number };
  pack?: { name: string; barcode: string; units: number; retail: number | null; wholesale: number | null };
}

// Barcodes are made up (prefix 200 = in-store use) so they never collide with real products.
const PRODUCTS: DemoProduct[] = [
  { name: "Tusker Lager", size: "500ml", category: "Beer", barcode: "2000000000011", retail: 250, wholesale: 220, cost: 190, stock: 120, returnable: { deposit: 20 }, pack: { name: "Crate", barcode: "2000000000028", units: 25, retail: 5800, wholesale: 5300 } },
  { name: "Guinness", size: "500ml", category: "Beer", barcode: "2000000000035", retail: 280, wholesale: 250, cost: 215, stock: 75, returnable: { deposit: 20 }, pack: { name: "Crate", barcode: "2000000000042", units: 25, retail: 6600, wholesale: 6100 } },
  { name: "White Cap Lager", size: "500ml", category: "Beer", barcode: "2000000000059", retail: 260, wholesale: 230, cost: 200, stock: 50, returnable: { deposit: 20 }, pack: { name: "Crate", barcode: "2000000000066", units: 25, retail: null, wholesale: null } },
  { name: "Smirnoff Vodka", size: "750ml", category: "Spirits", barcode: "2000000000073", retail: 1800, wholesale: 1650, cost: 1450, stock: 24, pack: { name: "Carton", barcode: "2000000000080", units: 12, retail: 20500, wholesale: 19200 } },
  { name: "Kenya Cane", size: "750ml", category: "Spirits", barcode: "2000000000097", retail: 950, wholesale: 870, cost: 760, stock: 36 },
  { name: "Chrome Vodka", size: "250ml", category: "Spirits", barcode: "2000000000103", retail: 300, wholesale: 270, cost: 230, stock: 60 },
  { name: "Gilbey's Gin", size: "750ml", category: "Spirits", barcode: "2000000000110", retail: 1600, wholesale: null, cost: 1300, stock: 18 },
  { name: "Jameson Irish Whiskey", size: "750ml", category: "Spirits", barcode: "2000000000127", retail: 3800, wholesale: 3550, cost: 3100, stock: 6 },
  { name: "Four Cousins Sweet Red", size: "750ml", category: "Wine", barcode: "2000000000134", retail: 1200, wholesale: 1100, cost: 900, stock: 12 },
  { name: "Coca-Cola", size: "500ml", category: "Soft drinks", barcode: "2000000000141", retail: 80, wholesale: 70, cost: 55, stock: 96 },
  { name: "Dasani Water", size: "500ml", category: "Soft drinks", barcode: "2000000000158", retail: 60, wholesale: null, cost: 35, stock: 3 },
];

export const DEMO_SUPPLIER = { name: "KBL Distributors Nairobi", phone: "+254711999888", notes: "Demo supplier" };
export const DEMO_OWNER_NAME = "Demo Owner";
export const DEMO_CASHIER_NAME = "Mary Wanjiku";

const CUSTOMERS = [
  { name: "Mama Njeri", phone: "+254711000111", priceTier: "RETAIL" as const, type: "CUSTOMER" as const },
  { name: "Club 41 Lounge", phone: "+254722000222", priceTier: "WHOLESALE" as const, type: "CUSTOMER" as const, creditLimit: 50000 },
  { name: "Kevo (promoter)", phone: "+254733000333", priceTier: "RETAIL" as const, type: "PROMOTER" as const },
];

async function main() {
  const env = process.env;
  const production = env.DB_TARGET === "production";
  const url = production ? env.PROD_DATABASE_URL_UNPOOLED : env.DATABASE_URL;
  if (!url) throw new Error(production ? "PROD_DATABASE_URL_UNPOOLED must be set" : "DATABASE_URL must be set");
  if (production && env.ALLOW_PRODUCTION_DEMO !== "yes") {
    throw new Error("Seeding production needs ALLOW_PRODUCTION_DEMO=yes (it adds demo data you must wipe later).");
  }
  if (!production && host(url) === host(env.PROD_DATABASE_URL_UNPOOLED)) {
    throw new Error("DATABASE_URL points at production; use DB_TARGET=production deliberately.");
  }
  console.log(`Seeding demo catalog into ${production ? "PRODUCTION" : "dev"} (${host(url)})`);

  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  const admin = await db.query.users.findFirst({ where: eq(schema.users.role, "ADMIN") });
  if (!admin) throw new Error("Run `pnpm db:seed` first to create the admin user");

  await db.transaction(async (tx) => {
    const categoryIds = new Map<string, string>();
    for (const [index, name] of [...new Set(PRODUCTS.map((p) => p.category))].entries()) {
      const [row] = await tx
        .insert(schema.categories)
        .values({ name, sortOrder: index })
        .onConflictDoUpdate({ target: schema.categories.name, set: { sortOrder: index } })
        .returning({ id: schema.categories.id });
      if (row) categoryIds.set(name, row.id);
    }

    for (const p of PRODUCTS) {
      const existing = await tx.query.products.findFirst({ where: eq(schema.products.barcode, p.barcode) });
      if (existing) continue;

      const [product] = await tx
        .insert(schema.products)
        .values({
          name: p.name,
          size: p.size,
          barcode: p.barcode,
          categoryId: categoryIds.get(p.category) ?? null,
          retailPrice: p.retail,
          wholesalePrice: p.wholesale,
          costPrice: p.cost,
          stockOnHand: p.stock,
          reorderLevel: 12,
          isReturnable: Boolean(p.returnable),
          depositAmount: p.returnable?.deposit ?? 0,
        })
        .returning({ id: schema.products.id });
      if (!product) throw new Error(`Failed to insert ${p.name}`);

      await tx.insert(schema.stockMovements).values({
        productId: product.id,
        type: "ADJUSTMENT",
        quantity: p.stock,
        userId: admin.id,
        reason: "Demo opening stock",
      });

      if (p.pack) {
        await tx.insert(schema.productUnits).values({
          productId: product.id,
          name: p.pack.name,
          barcode: p.pack.barcode,
          unitsPerPack: p.pack.units,
          retailPrice: p.pack.retail,
          wholesalePrice: p.pack.wholesale,
        });
      }
    }

    for (const c of CUSTOMERS) {
      const exists = await tx.query.customers.findFirst({ where: eq(schema.customers.phone, c.phone) });
      if (!exists) await tx.insert(schema.customers).values(c);
    }

    if (!(await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.name, DEMO_SUPPLIER.name) }))) {
      await tx.insert(schema.suppliers).values(DEMO_SUPPLIER);
    }

    // Demo logins: a separate owner (so the real owner account stays clean) and a cashier.
    const logins = [
      { name: DEMO_OWNER_NAME, role: "ADMIN" as const, phone: env.DEMO_OWNER_PHONE, pin: env.DEMO_OWNER_PIN },
      { name: DEMO_CASHIER_NAME, role: "CASHIER" as const, phone: env.DEMO_CASHIER_PHONE, pin: env.DEMO_CASHIER_PIN },
    ];
    for (const login of logins) {
      if (!login.phone || !login.pin) continue;
      const pinHash = await bcrypt.hash(login.pin, 12);
      const existing = await tx.query.users.findFirst({ where: eq(schema.users.phone, login.phone) });
      if (existing) {
        await tx
          .update(schema.users)
          .set({ name: login.name, role: login.role, pinHash, isActive: true, failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(schema.users.id, existing.id));
      } else {
        await tx.insert(schema.users).values({ name: login.name, role: login.role, phone: login.phone, pinHash });
      }
    }
  });

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.products);
  console.log(`Demo catalog ready: ${count} products.`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
