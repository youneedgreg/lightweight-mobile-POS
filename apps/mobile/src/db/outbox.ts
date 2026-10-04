import { SYNC_KINDS, type SyncKind, type SyncPayload } from "@liquor-pos/shared";

import type { Executor } from "./database";

/**
 * Queues a record for upload. Must be called inside the same transaction as
 * the local change it describes, so the phone never shows something that
 * won't be uploaded (or uploads something it doesn't show).
 */
export async function enqueue<K extends SyncKind>(
  tx: Executor,
  kind: K,
  payload: SyncPayload<K> & { id: string },
  /** Human-readable description, shown if the server rejects the record. */
  summary: string,
): Promise<void> {
  await tx.runAsync(
    "INSERT INTO sync_queue (id, kind, priority, payload, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [payload.id, kind, SYNC_KINDS[kind].priority, JSON.stringify(payload), summary, new Date().toISOString()],
  );
}
