import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

/**
 * Local SQLite database: the phone's offline copy of the catalog plus
 * everything waiting to be uploaded. Survives logout on purpose — queued
 * sales must never be lost.
 */

export type Database = SQLite.SQLiteDatabase;
/** Anything that can run queries: the database or an open transaction. */
export type Executor = Pick<SQLite.SQLiteDatabase, "runAsync" | "getFirstAsync" | "getAllAsync" | "execAsync">;

const DATABASE_NAME = "liquor-pos.db";

/** Append-only. Each entry upgrades the schema by one version (PRAGMA user_version). */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    size TEXT,
    barcode TEXT,
    category_id TEXT,
    retail_price INTEGER NOT NULL,
    wholesale_price INTEGER,
    stock_on_hand INTEGER NOT NULL,
    is_returnable INTEGER NOT NULL,
    deposit_amount INTEGER NOT NULL,
    image_url TEXT,
    is_active INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX products_barcode_idx ON products (barcode);
  CREATE INDEX products_name_idx ON products (name COLLATE NOCASE);

  CREATE TABLE product_units (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    units_per_pack INTEGER NOT NULL,
    retail_price INTEGER,
    wholesale_price INTEGER,
    is_active INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX product_units_barcode_idx ON product_units (barcode);
  CREATE INDEX product_units_product_idx ON product_units (product_id);

  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE customers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    type TEXT NOT NULL,
    price_tier TEXT NOT NULL,
    credit_limit INTEGER,
    balance INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX customers_name_idx ON customers (name COLLATE NOCASE);

  -- Local sales history (what this phone sold), for the Sales screen.
  CREATE TABLE sales (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_no TEXT NOT NULL UNIQUE,
    cashier_id TEXT NOT NULL,
    cashier_name TEXT,
    customer_id TEXT,
    customer_name TEXT,
    price_tier TEXT NOT NULL,
    item_count INTEGER NOT NULL,
    total INTEGER NOT NULL,
    discount INTEGER NOT NULL,
    payment_methods TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    sync_error TEXT
  );
  CREATE INDEX sales_occurred_at_idx ON sales (occurred_at);

  -- Outbox: work waiting to be uploaded. Rows are deleted once the server confirms them.
  CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('customer', 'sale')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rejected')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE INDEX sync_queue_status_idx ON sync_queue (status, kind, created_at);

  CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2: suppliers, cost prices, till cash log, and an outbox for every kind of record.
  `
  ALTER TABLE products ADD COLUMN cost_price INTEGER;

  CREATE TABLE suppliers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  -- Every movement of cash in or out of the drawer during a shift (positive = in).
  CREATE TABLE cash_movements (
    id TEXT PRIMARY KEY NOT NULL,
    shift_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX cash_movements_shift_idx ON cash_movements (shift_id);

  -- Rebuild the outbox: any record kind, uploaded in priority order.
  CREATE TABLE sync_queue_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    priority INTEGER NOT NULL,
    payload TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rejected')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  INSERT INTO sync_queue_v2 (id, kind, priority, payload, created_at, status, attempts, last_error)
    SELECT id, kind, CASE kind WHEN 'customer' THEN 0 ELSE 3 END, payload, created_at, status, attempts, last_error
    FROM sync_queue;
  DROP TABLE sync_queue;
  ALTER TABLE sync_queue_v2 RENAME TO sync_queue;
  CREATE INDEX sync_queue_order_idx ON sync_queue (status, priority, created_at);
  `,
];

async function migrate(db: Database): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version] as string);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

let databasePromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  databasePromise ??= SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
    await migrate(db);
    return db;
  });
  return databasePromise;
}

/**
 * Runs `task` in a transaction. Native uses an exclusive transaction so no
 * other write can interleave; web (development preview only) lacks that API.
 */
export async function inTransaction<T>(db: Database, task: (tx: Executor) => Promise<T>): Promise<T> {
  let result: T | undefined;
  if (Platform.OS === "web") {
    await db.withTransactionAsync(async () => {
      result = await task(db);
    });
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => {
      result = await task(txn);
    });
  }
  return result as T;
}

export async function getMeta(db: Executor, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setMeta(db: Executor, key: string, value: string): Promise<void> {
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
