import {
  canUpload,
  catalogResponseSchema,
  SYNC_KIND_NAMES,
  SYNC_MAX_ITEMS,
  syncResponseSchema,
  type SyncItemResult,
  type SyncKind,
  type UserRole,
} from "@liquor-pos/shared";

import { applyCatalog } from "@/db/catalog-repo";
import { getMeta, inTransaction, setMeta, type Database } from "@/db/database";
import { apiRequest } from "@/lib/api";

const CATALOG_CURSOR_KEY = "catalog_cursor";
/** Set once an owner has done a full catalog pull on this phone (cashier pulls don't include cost prices). */
const OWNER_FULL_PULL_KEY = "owner_full_pull";
const LAST_SYNC_KEY = "last_synced_at";
/** Safety stop so a server that keeps returning work can't loop forever. */
const MAX_PUSH_ROUNDS = 20;

interface QueueRow {
  id: string;
  kind: SyncKind;
  payload: string;
}

export interface QueueCounts {
  /** Records waiting to upload. */
  pending: number;
  /** Records the server refused; need attention. */
  rejected: number;
}

export async function getQueueCounts(db: Database): Promise<QueueCounts> {
  const row = await db.getFirstAsync<{ pending: number; rejected: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected
     FROM sync_queue`,
  );
  return { pending: row?.pending ?? 0, rejected: row?.rejected ?? 0 };
}

export interface RejectedItem {
  id: string;
  kind: SyncKind;
  summary: string | null;
  error: string | null;
}

export async function listRejected(db: Database): Promise<RejectedItem[]> {
  return db.getAllAsync<RejectedItem>(
    "SELECT id, kind, summary, last_error AS error FROM sync_queue WHERE status = 'rejected' ORDER BY created_at",
  );
}

export async function getLastSyncedAt(db: Database): Promise<string | null> {
  return getMeta(db, LAST_SYNC_KEY);
}

/** Applies the server's verdicts: confirmed records leave the queue, rejected ones stay for attention. */
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
 * Uploads the outbox in batches, lowest priority number first (customers and
 * shift openings before sales, shift closings last), oldest first within a
 * priority. Owner-only records wait until an owner is signed in. Stops at the
 * first failed request; anything unconfirmed stays queued.
 */
async function push(db: Database, token: string, role: UserRole): Promise<number> {
  const kinds = SYNC_KIND_NAMES.filter((kind) => canUpload(kind, role));
  const placeholders = kinds.map(() => "?").join(",");
  let uploaded = 0;

  for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
    const rows = await db.getAllAsync<QueueRow>(
      `SELECT id, kind, payload FROM sync_queue
       WHERE status = 'pending' AND kind IN (${placeholders})
       ORDER BY priority, created_at LIMIT ?`,
      [...kinds, SYNC_MAX_ITEMS],
    );
    if (rows.length === 0) break;

    const response = await apiRequest("/api/mobile/sync", {
      method: "POST",
      token,
      body: { items: rows.map((row) => ({ kind: row.kind, data: JSON.parse(row.payload) as unknown })) },
      schema: syncResponseSchema,
    });

    // Results come back in request order; trust our ids over the server's echo.
    const results = rows.map((row, index): SyncItemResult => {
      const result = response.results[index];
      return result ? { ...result, id: row.id } : { id: row.id, status: "rejected", message: "No result from server." };
    });
    await applyResults(db, results);
    uploaded += results.filter((r) => r.status !== "rejected").length;
  }
  return uploaded;
}

/**
 * Downloads catalog changes since the last cursor (everything on first run).
 * The first time an owner syncs a phone that cashiers have used, it pulls
 * everything again so cost prices fill in.
 */
async function pull(db: Database, token: string, role: UserRole): Promise<void> {
  const needsOwnerPull = role === "ADMIN" && (await getMeta(db, OWNER_FULL_PULL_KEY)) === null;
  const since = needsOwnerPull ? null : await getMeta(db, CATALOG_CURSOR_KEY);
  const path = since ? `/api/mobile/catalog?since=${encodeURIComponent(since)}` : "/api/mobile/catalog";
  const catalog = await apiRequest(path, { token, schema: catalogResponseSchema });
  await applyCatalog(db, catalog);
  await setMeta(db, CATALOG_CURSOR_KEY, catalog.cursor);
  if (needsOwnerPull) await setMeta(db, OWNER_FULL_PULL_KEY, catalog.cursor);
}

export interface SyncResult {
  uploaded: number;
  finishedAt: string;
}

/**
 * One full sync: push before pull, so the stock and balances pulled from the
 * server already include this phone's records. Throws ApiRequestError on failure.
 */
export async function runSync(db: Database, token: string, role: UserRole): Promise<SyncResult> {
  const uploaded = await push(db, token, role);
  await pull(db, token, role);
  const finishedAt = new Date().toISOString();
  await setMeta(db, LAST_SYNC_KEY, finishedAt);
  return { uploaded, finishedAt };
}

/** Puts rejected records back in the queue, e.g. after the owner fixes the catalog. */
export async function retryRejected(db: Database): Promise<void> {
  await inTransaction(db, async (tx) => {
    await tx.runAsync("UPDATE sync_queue SET status = 'pending' WHERE status = 'rejected'");
    await tx.runAsync("UPDATE sales SET sync_status = 'pending' WHERE sync_status = 'rejected'");
  });
}

/** Removes a rejected record for good (owner decision). Its local effects stay as they are. */
export async function discardRejected(db: Database, id: string): Promise<void> {
  await db.runAsync("DELETE FROM sync_queue WHERE id = ? AND status = 'rejected'", id);
}
