import type { CatalogResponse } from "@liquor-pos/shared";
import { eq, gte, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { categories, customerLedger, customers, productUnits, products, supplierLedger, suppliers } from "@/db/schema";
import { ANY_ROLE, withAuth } from "@/lib/auth/guard";
import { apiError } from "@/lib/http";

/**
 * Rows committed slightly after the previous cursor was taken can carry an
 * updated_at just before it; re-sending a minute of overlap catches them.
 * Phones upsert, so repeats are harmless.
 */
const CURSOR_OVERLAP_MS = 60_000;

/**
 * Catalog pull for phones: products, packs, categories, customers and suppliers changed
 * since `?since=<cursor>` (or everything when omitted). Inactive rows are
 * included so phones can hide them.
 */
export const GET = withAuth(ANY_ROLE, async (request, _context, principal) => {
  const sinceParam = new URL(request.url).searchParams.get("since");
  let since: Date | null = null;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (Number.isNaN(parsed.getTime())) return apiError("BAD_REQUEST", "Invalid `since` cursor.");
    since = new Date(parsed.getTime() - CURSOR_OVERLAP_MS);
  }
  const changedSince = (column: PgColumn): SQL | undefined => (since ? gte(column, since) : undefined);

  // Take the cursor from the database clock before reading, so nothing committed later is skipped.
  const cursorResult = await db.execute<{ now: string }>(sql`select now()::text as now`);
  const cursor = new Date(cursorResult.rows[0]?.now ?? Date.now()).toISOString();

  const balance = db
    .select({
      customerId: customerLedger.customerId,
      balance: sql<number>`coalesce(sum(${customerLedger.amount}), 0)::int`.as("balance"),
    })
    .from(customerLedger)
    .groupBy(customerLedger.customerId)
    .as("balance");

  const supplierBalance = db
    .select({
      supplierId: supplierLedger.supplierId,
      balance: sql<number>`coalesce(sum(${supplierLedger.amount}), 0)::int`.as("supplier_balance"),
    })
    .from(supplierLedger)
    .groupBy(supplierLedger.supplierId)
    .as("supplier_balance");

  const [productRows, unitRows, categoryRows, customerRows, supplierRows] = await Promise.all([
    db.select().from(products).where(changedSince(products.updatedAt)),
    db.select().from(productUnits).where(changedSince(productUnits.updatedAt)),
    db.select().from(categories).where(changedSince(categories.updatedAt)),
    db
      .select({ customer: customers, balance: sql<number>`coalesce(${balance.balance}, 0)` })
      .from(customers)
      .leftJoin(balance, eq(balance.customerId, customers.id))
      .where(changedSince(customers.updatedAt)),
    db
      .select({ supplier: suppliers, balance: sql<number>`coalesce(${supplierBalance.balance}, 0)` })
      .from(suppliers)
      .leftJoin(supplierBalance, eq(supplierBalance.supplierId, suppliers.id))
      .where(changedSince(suppliers.updatedAt)),
  ]);
  const isOwner = principal.role === "ADMIN";

  const body: CatalogResponse = {
    cursor,
    products: productRows.map((p) => ({
      id: p.id,
      name: p.name,
      size: p.size,
      barcode: p.barcode,
      categoryId: p.categoryId,
      retailPrice: p.retailPrice,
      wholesalePrice: p.wholesalePrice,
      // Cost prices are only for the owner's eyes.
      costPrice: isOwner ? p.costPrice : null,
      stockOnHand: p.stockOnHand,
      isReturnable: p.isReturnable,
      depositAmount: p.depositAmount,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      updatedAt: p.updatedAt.toISOString(),
    })),
    units: unitRows.map((u) => ({
      id: u.id,
      productId: u.productId,
      name: u.name,
      barcode: u.barcode,
      unitsPerPack: u.unitsPerPack,
      retailPrice: u.retailPrice,
      wholesalePrice: u.wholesalePrice,
      isActive: u.isActive,
      updatedAt: u.updatedAt.toISOString(),
    })),
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      updatedAt: c.updatedAt.toISOString(),
    })),
    customers: customerRows.map(({ customer: c, balance: owed }) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      type: c.type,
      priceTier: c.priceTier,
      creditLimit: c.creditLimit,
      balance: Number(owed),
      isActive: c.isActive,
      updatedAt: c.updatedAt.toISOString(),
    })),
    suppliers: supplierRows.map(({ supplier: s, balance: owed }) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      balance: Number(owed),
      isActive: s.isActive,
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
  return Response.json(body);
});
