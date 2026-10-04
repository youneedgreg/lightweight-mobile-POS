import {
  catalogResponseSchema,
  SYNC_MAX_CUSTOMERS,
  SYNC_MAX_SALES,
  syncResponseSchema,
  type SyncItemResult,
} from "@liquor-pos/shared";

import { applyCatalog } from "@/db/catalog-repo";
import { getMeta, inTransaction, setMeta, type Database } from "@/db/database";
import { apiRequest } from "@/lib/api";

const CATALOG_CURSOR_KEY = "catalog_cursor";
const LAST_SYNC_KEY = "last_synced_at";
/** Safety stop so a server that keeps returning work can't loop forever. */
const MAX_PUSH_ROUNDS = 20;

interface QueueRow {
  id: string;
  kind: "customer" | "sale";
  payload: string;
}

export interface QueueCounts {
  pending: number;
  rejected: number;
}

export async function getQueueCounts(db: Database): Promise<QueueCounts> {
  const row = await db.getFirstAsync<{ pending: number; rejected: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected
     FROM sync_queue WHERE kind = 'sale'`,
  );
  return { pending: row?.pending ?? 0, rejected: row?.rejected ?? 0 };
}

export async function getLastSyncedAt(db: Database): Promise<string | null> {
  return getMeta(db, LAST_SYNC_KEY);
}

/** Applies the server's verdicts: confirmed work leaves the queue, rejected work stays for attention. */
async function applyResults(db: Database, results: readonly SyncItemResult[]): Promise<void> {
  await inTransaction(db, async (tx) => {
    for (const result of results) {
      if (result.status === "rejected") {
        await tx.runAsync(
          "UPDATE sync_queue SET status = 'rejected', attempts = attempts + 1, last_error = ? WHERE id = ?",
          [result.message, result.id],
        );
        await tx.runAsync("UPDATE sales SET sync_status = 'rejected', sync_error = ? WHERE id = ?", [
          result.message,
          result.id,
        ]);
      } else {
        await tx.runAsync("DELETE FROM sync_queue WHERE id = ?", result.id);
        await tx.runAsync("UPDATE sales SET sync_status = 'synced', sync_error = NULL WHERE id = ?", result.id);
      }
    }
  });
}

/**
 * Uploads the outbox in batches: customers first (sales may reference them),
 * oldest first. Stops at the first request failure; everything not confirmed
 * stays queued and is retried next time.
 */
async function push(db: Database, token: string): Promise<number> {
  let uploaded = 0;
  for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
    const customers = await db.getAllAsync<QueueRow>(
      "SELECT id, kind, payload FROM sync_queue WHERE status = 'pending' AND kind = 'customer' ORDER BY created_at LIMIT ?",
      SYNC_MAX_CUSTOMERS,
    );
    const sales = await db.getAllAsync<QueueRow>(
      "SELECT id, kind, payload FROM sync_queue WHERE status = 'pending' AND kind = 'sale' ORDER BY created_at LIMIT ?",
      SYNC_MAX_SALES,
    );
    if (customers.length === 0 && sales.length === 0) break;

    const response = await apiRequest("/api/mobile/sync", {
      method: "POST",
      token,
      body: {
        customers: customers.map((row) => JSON.parse(row.payload) as unknown),
        sales: sales.map((row) => JSON.parse(row.payload) as unknown),
      },
      schema: syncResponseSchema,
    });

    await applyResults(db, [...response.customers, ...response.sales]);
    uploaded += response.sales.filter((s) => s.status !== "rejected").length;
  }
  return uploaded;
}

/** Downloads catalog changes since the last cursor (everything on first run). */
async function pull(db: Database, token: string): Promise<void> {
  const since = await getMeta(db, CATALOG_CURSOR_KEY);
  const path = since ? `/api/mobile/catalog?since=${encodeURIComponent(since)}` : "/api/mobile/catalog";
  const catalog = await apiRequest(path, { token, schema: catalogResponseSchema });
  await applyCatalog(db, catalog);
  await setMeta(db, CATALOG_CURSOR_KEY, catalog.cursor);
}

export interface SyncResult {
  uploaded: number;
  finishedAt: string;
}

/**
 * One full sync: push before pull, so the stock levels pulled from the server
 * already include this phone's sales. Throws ApiRequestError on failure.
 */
export async function runSync(db: Database, token: string): Promise<SyncResult> {
  const uploaded = await push(db, token);
  await pull(db, token);
  const finishedAt = new Date().toISOString();
  await setMeta(db, LAST_SYNC_KEY, finishedAt);
  return { uploaded, finishedAt };
}

/** Puts rejected items back in the queue, e.g. after the owner fixes the catalog. */
export async function retryRejected(db: Database): Promise<void> {
  await inTransaction(db, async (tx) => {
    await tx.runAsync("UPDATE sync_queue SET status = 'pending' WHERE status = 'rejected'");
    await tx.runAsync("UPDATE sales SET sync_status = 'pending' WHERE sync_status = 'rejected'");
  });
}
