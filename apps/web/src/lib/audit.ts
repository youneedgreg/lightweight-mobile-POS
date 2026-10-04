import "server-only";

import { db } from "@/db";
import { auditLog } from "@/db/schema";

type Executor = Pick<typeof db, "insert">;

/** Records a sensitive action. Pass a transaction as `executor` to make it atomic with the change. */
export async function audit(
  entry: {
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    data?: Record<string, unknown>;
  },
  executor: Executor = db,
): Promise<void> {
  await executor.insert(auditLog).values({ ...entry, data: entry.data ?? null });
}
