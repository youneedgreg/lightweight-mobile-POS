import "server-only";

import type { SyncItemResult } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { Principal } from "@/lib/auth/guard";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The authenticated phone uploading a batch. */
export interface Uploader extends Principal {
  deviceId: string;
}

export const created = (id: string): SyncItemResult => ({ id, status: "created", message: null });
export const duplicate = (id: string): SyncItemResult => ({ id, status: "duplicate", message: null });
export const rejected = (id: string, message: string): SyncItemResult => ({ id, status: "rejected", message });

export function pgErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  // Drizzle wraps driver errors; the Postgres error is the cause.
  if ("cause" in error) return pgErrorCode(error.cause);
  return null;
}

/**
 * Runs a handler's transaction and turns constraint violations into
 * "rejected" results, so one bad record never fails the whole batch.
 */
export async function guarded(id: string, run: () => Promise<SyncItemResult>): Promise<SyncItemResult> {
  try {
    return await run();
  } catch (error) {
    switch (pgErrorCode(error)) {
      case "23503":
        return rejected(id, "Refers to a person, product, customer, supplier or shift the server doesn't know.");
      case "23505":
        return rejected(id, "An id or number in this record is already used by a different record.");
      case "23514":
        return rejected(id, "The record breaks a data rule (e.g. a negative or zero amount).");
      default:
        throw error;
    }
  }
}

/** The role of the person who made a record, or null if they don't exist. */
export async function roleOf(userId: string): Promise<"ADMIN" | "CASHIER" | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { role: true } });
  return user?.role ?? null;
}
