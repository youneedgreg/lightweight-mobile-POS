import type {
  CatalogResponse,
  CustomerType,
  PriceTier,
  PricedProduct,
  PricedUnit,
} from "@liquor-pos/shared";
import * as Crypto from "expo-crypto";

import { inTransaction, type Database, type Executor } from "./database";

export interface Product extends PricedProduct {
  barcode: string | null;
  categoryId: string | null;
  stockOnHand: number;
  imageUrl: string | null;
  units: Unit[];
}

export interface Unit extends PricedUnit {
  productId: string;
  barcode: string | null;
}

export interface Category {
  id: string;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  type: CustomerType;
  priceTier: PriceTier;
  creditLimit: number | null;
  balance: number;
}

interface ProductRow {
  id: string;
  name: string;
  size: string | null;
  barcode: string | null;
  category_id: string | null;
  retail_price: number;
  wholesale_price: number | null;
  stock_on_hand: number;
  image_url: string | null;
}

interface UnitRow {
  id: string;
  product_id: string;
  name: string;
  barcode: string | null;
  units_per_pack: number;
  retail_price: number | null;
  wholesale_price: number | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  type: CustomerType;
  price_tier: PriceTier;
  credit_limit: number | null;
  balance: number;
}

const toUnit = (row: UnitRow): Unit => ({
  id: row.id,
  productId: row.product_id,
  name: row.name,
  barcode: row.barcode,
  unitsPerPack: row.units_per_pack,
  retailPrice: row.retail_price,
  wholesalePrice: row.wholesale_price,
});

const toCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  type: row.type,
  priceTier: row.price_tier,
  creditLimit: row.credit_limit,
  balance: row.balance,
});

async function withUnits(db: Executor, rows: ProductRow[]): Promise<Product[]> {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const unitRows = await db.getAllAsync<UnitRow>(
    `SELECT * FROM product_units WHERE is_active = 1 AND product_id IN (${placeholders}) ORDER BY units_per_pack`,
    rows.map((row) => row.id),
  );
  const unitsByProduct = new Map<string, Unit[]>();
  for (const unit of unitRows.map(toUnit)) {
    unitsByProduct.set(unit.productId, [...(unitsByProduct.get(unit.productId) ?? []), unit]);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    size: row.size,
    barcode: row.barcode,
    categoryId: row.category_id,
    retailPrice: row.retail_price,
    wholesalePrice: row.wholesale_price,
    stockOnHand: row.stock_on_hand,
    imageUrl: row.image_url,
    units: unitsByProduct.get(row.id) ?? [],
  }));
}

/** Upserts a catalog pull. Runs in one transaction so the catalog is never half-updated. */
export async function applyCatalog(db: Database, catalog: CatalogResponse): Promise<void> {
  await inTransaction(db, async (tx) => {
    for (const p of catalog.products) {
      await tx.runAsync(
        `INSERT INTO products (id, name, size, barcode, category_id, retail_price, wholesale_price, stock_on_hand,
           is_returnable, deposit_amount, image_url, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, size = excluded.size, barcode = excluded.barcode, category_id = excluded.category_id,
           retail_price = excluded.retail_price, wholesale_price = excluded.wholesale_price,
           stock_on_hand = excluded.stock_on_hand, is_returnable = excluded.is_returnable,
           deposit_amount = excluded.deposit_amount, image_url = excluded.image_url,
           is_active = excluded.is_active, updated_at = excluded.updated_at`,
        [p.id, p.name, p.size, p.barcode, p.categoryId, p.retailPrice, p.wholesalePrice, p.stockOnHand,
          p.isReturnable ? 1 : 0, p.depositAmount, p.imageUrl, p.isActive ? 1 : 0, p.updatedAt],
      );
    }
    for (const u of catalog.units) {
      await tx.runAsync(
        `INSERT INTO product_units (id, product_id, name, barcode, units_per_pack, retail_price, wholesale_price, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           product_id = excluded.product_id, name = excluded.name, barcode = excluded.barcode,
           units_per_pack = excluded.units_per_pack, retail_price = excluded.retail_price,
           wholesale_price = excluded.wholesale_price, is_active = excluded.is_active, updated_at = excluded.updated_at`,
        [u.id, u.productId, u.name, u.barcode, u.unitsPerPack, u.retailPrice, u.wholesalePrice, u.isActive ? 1 : 0, u.updatedAt],
      );
    }
    for (const c of catalog.categories) {
      await tx.runAsync(
        `INSERT INTO categories (id, name, sort_order, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
        [c.id, c.name, c.sortOrder, c.updatedAt],
      );
    }
    for (const c of catalog.customers) {
      await tx.runAsync(
        `INSERT INTO customers (id, name, phone, type, price_tier, credit_limit, balance, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, phone = excluded.phone, type = excluded.type, price_tier = excluded.price_tier,
           credit_limit = excluded.credit_limit, balance = excluded.balance, is_active = excluded.is_active,
           updated_at = excluded.updated_at`,
        [c.id, c.name, c.phone, c.type, c.priceTier, c.creditLimit, c.balance, c.isActive ? 1 : 0, c.updatedAt],
      );
    }
  });
}

/** Active products matching a name fragment or exact barcode, optionally within a category. */
export async function searchProducts(
  db: Database,
  { query = "", categoryId = null, limit = 100 }: { query?: string; categoryId?: string | null; limit?: number } = {},
): Promise<Product[]> {
  const term = query.trim();
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT * FROM products
     WHERE is_active = 1
       AND (? = '' OR name LIKE '%' || ? || '%' COLLATE NOCASE OR barcode = ?)
       AND (? IS NULL OR category_id = ?)
     ORDER BY name COLLATE NOCASE, size
     LIMIT ?`,
    [term, term, term, categoryId, categoryId, limit],
  );
  return withUnits(db, rows);
}

/** Finds what a scanned barcode refers to: a single bottle, or a pack of a product. */
export async function findByBarcode(
  db: Database,
  barcode: string,
): Promise<{ product: Product; unit: Unit | null } | null> {
  const code = barcode.trim();
  if (!code) return null;

  const productRow = await db.getFirstAsync<ProductRow>(
    "SELECT * FROM products WHERE barcode = ? AND is_active = 1",
    code,
  );
  if (productRow) {
    const [product] = await withUnits(db, [productRow]);
    return product ? { product, unit: null } : null;
  }

  const unitRow = await db.getFirstAsync<UnitRow>(
    "SELECT * FROM product_units WHERE barcode = ? AND is_active = 1",
    code,
  );
  if (!unitRow) return null;
  const parent = await db.getFirstAsync<ProductRow>(
    "SELECT * FROM products WHERE id = ? AND is_active = 1",
    unitRow.product_id,
  );
  if (!parent) return null;
  const [product] = await withUnits(db, [parent]);
  return product ? { product, unit: toUnit(unitRow) } : null;
}

export async function getProductsByIds(db: Database, ids: readonly string[]): Promise<Map<string, Product>> {
  if (ids.length === 0) return new Map();
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
    [...ids],
  );
  return new Map((await withUnits(db, rows)).map((product) => [product.id, product]));
}

export async function listCategories(db: Database): Promise<Category[]> {
  return db.getAllAsync<Category>(
    `SELECT c.id, c.name FROM categories c
     WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_active = 1)
     ORDER BY c.sort_order, c.name`,
  );
}

export async function countProducts(db: Database): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM products WHERE is_active = 1");
  return row?.count ?? 0;
}

export async function searchCustomers(db: Database, query = ""): Promise<Customer[]> {
  const term = query.trim();
  const rows = await db.getAllAsync<CustomerRow>(
    `SELECT * FROM customers
     WHERE is_active = 1 AND (? = '' OR name LIKE '%' || ? || '%' COLLATE NOCASE OR phone LIKE '%' || ? || '%')
     ORDER BY name COLLATE NOCASE LIMIT 100`,
    [term, term, term],
  );
  return rows.map(toCustomer);
}

export async function getCustomer(db: Database, id: string): Promise<Customer | null> {
  const row = await db.getFirstAsync<CustomerRow>("SELECT * FROM customers WHERE id = ?", id);
  return row ? toCustomer(row) : null;
}

/** Creates a customer on the phone (works offline) and queues it for upload. */
export async function createCustomer(
  db: Database,
  { name, phone }: { name: string; phone: string | null },
): Promise<Customer> {
  const customer: Customer = {
    id: Crypto.randomUUID(),
    name: name.trim(),
    phone: phone?.trim() || null,
    type: "CUSTOMER",
    priceTier: "RETAIL",
    creditLimit: null,
    balance: 0,
  };
  const now = new Date().toISOString();
  await inTransaction(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO customers (id, name, phone, type, price_tier, credit_limit, balance, is_active, updated_at)
       VALUES (?, ?, ?, 'CUSTOMER', 'RETAIL', NULL, 0, 1, ?)`,
      [customer.id, customer.name, customer.phone, now],
    );
    await tx.runAsync(
      "INSERT INTO sync_queue (id, kind, payload, created_at) VALUES (?, 'customer', ?, ?)",
      [customer.id, JSON.stringify({ id: customer.id, name: customer.name, phone: customer.phone }), now],
    );
  });
  return customer;
}
