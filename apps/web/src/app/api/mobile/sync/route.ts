import {
  saleInputSchema,
  syncRequestSchema,
  type SyncItemResult,
  type SyncResponse,
} from "@liquor-pos/shared";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { customers, devices } from "@/db/schema";
import { ANY_ROLE, withAuth } from "@/lib/auth/guard";
import { apiError, parseJsonBody } from "@/lib/http";
import { recordSale } from "@/lib/sales/record-sale";

/**
 * Upload queued work from a phone. Customers are stored first so sales can
 * reference customers created offline. Each item gets its own result; one bad
 * sale never blocks the rest of the batch.
 */
export const POST = withAuth(ANY_ROLE, async (request, _context, principal) => {
  if (!principal.deviceId) return apiError("FORBIDDEN", "Sync is only available from the POS app.");

  const parsed = await parseJsonBody(request, syncRequestSchema);
  if ("response" in parsed) return parsed.response;

  const customerResults: SyncItemResult[] = [];
  for (const customer of parsed.data.customers) {
    const inserted = await db
      .insert(customers)
      .values({ id: customer.id, name: customer.name, phone: customer.phone })
      .onConflictDoNothing({ target: customers.id })
      .returning({ id: customers.id });
    customerResults.push({ id: customer.id, status: inserted.length > 0 ? "created" : "duplicate", message: null });
  }

  const saleResults: SyncItemResult[] = [];
  for (const raw of parsed.data.sales) {
    const result = saleInputSchema.safeParse(raw);
    if (!result.success) {
      const id =
        typeof raw === "object" && raw !== null && "id" in raw && typeof raw.id === "string" ? raw.id : "unknown";
      saleResults.push({ id, status: "rejected", message: result.error.issues[0]?.message ?? "Invalid sale" });
      continue;
    }
    saleResults.push(await recordSale(result.data, principal.deviceId));
  }

  await db.update(devices).set({ lastSyncedAt: new Date() }).where(eq(devices.id, principal.deviceId));

  const body: SyncResponse = { customers: customerResults, sales: saleResults };
  return Response.json(body);
});
