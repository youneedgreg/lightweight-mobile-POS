import { syncRequestSchema, type SyncItemResult, type SyncResponse } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { devices } from "@/db/schema";
import { ANY_ROLE, withAuth } from "@/lib/auth/guard";
import { apiError, parseJsonBody } from "@/lib/http";
import { processSyncItem } from "@/lib/sync/dispatch";

/**
 * Upload queued records from a phone. Items are stored in the order sent
 * (the phone sends dependencies first). Each item gets its own result; one
 * bad record never blocks the rest of the batch.
 */
export const POST = withAuth(ANY_ROLE, async (request, _context, principal) => {
  const { deviceId } = principal;
  if (!deviceId) return apiError("FORBIDDEN", "Sync is only available from the POS app.");

  const parsed = await parseJsonBody(request, syncRequestSchema);
  if ("response" in parsed) return parsed.response;

  const results: SyncItemResult[] = [];
  for (const item of parsed.data.items) {
    results.push(await processSyncItem(item.kind, item.data, { ...principal, deviceId }));
  }

  await db.update(devices).set({ lastSyncedAt: new Date() }).where(eq(devices.id, deviceId));

  const body: SyncResponse = { results };
  return Response.json(body);
});
