import "server-only";

import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { devices } from "@/db/schema";

type Device = typeof devices.$inferSelect;

const MAX_PREFIX_ATTEMPTS = 5;

/**
 * Returns the device, registering it on first login with the next free
 * receipt prefix (D1, D2, …). Updates its label and last user on every login.
 */
export async function registerDeviceLogin(
  deviceId: string,
  label: string,
  userId: string,
): Promise<Device> {
  const existing = await db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
  if (existing) {
    if (!existing.isActive) return existing;
    const [updated] = await db
      .update(devices)
      .set({ label, lastUserId: userId })
      .where(eq(devices.id, deviceId))
      .returning();
    return updated ?? existing;
  }

  // Two phones registering at the same moment can pick the same prefix; retry on conflict.
  for (let attempt = 0; attempt < MAX_PREFIX_ATTEMPTS; attempt++) {
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(devices);
    const [created] = await db
      .insert(devices)
      .values({ id: deviceId, label, receiptPrefix: `D${total + 1 + attempt}`, lastUserId: userId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    // Conflict on id means the same phone registered concurrently; use that row.
    const raced = await db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
    if (raced) return raced;
  }
  throw new Error("Could not allocate a receipt prefix for the device");
}
