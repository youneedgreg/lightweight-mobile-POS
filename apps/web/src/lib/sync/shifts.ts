import "server-only";

import type { ShiftCloseInput, ShiftOpenInput, SyncItemResult } from "@liquor-pos/shared";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { emptiesLedger, expenses, payments, shifts, supplierLedger } from "@/db/schema";

import { created, duplicate, guarded, rejected, type Tx, type Uploader } from "./common";

export async function openShift(input: ShiftOpenInput, uploader: Uploader): Promise<SyncItemResult> {
  if (input.deviceId !== uploader.deviceId) return rejected(input.id, "Shift was opened on a different device.");

  return guarded(input.id, async () => {
    const inserted = await db
      .insert(shifts)
      .values({
        id: input.id,
        cashierId: input.cashierId,
        deviceId: input.deviceId,
        openingFloat: input.openingFloat,
        openedAt: new Date(input.openedAt),
        status: "OPEN",
      })
      .onConflictDoNothing({ target: shifts.id })
      .returning({ id: shifts.id });
    return inserted.length > 0 ? created(input.id) : duplicate(input.id);
  });
}

/**
 * Cash that should be in the drawer at the end of a shift:
 *   opening float
 * + cash taken (sales incl. deposits, and debt repayments)
 * − cash expenses
 * − cash paid to suppliers from the till
 * − deposits refunded for returned empties
 */
export async function expectedCash(tx: Tx | typeof db, shiftId: string, openingFloat: number): Promise<number> {
  const [cashIn, cashExpenses, supplierCash, depositRefunds] = await Promise.all([
    tx
      .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.shiftId, shiftId), eq(payments.method, "CASH"), eq(payments.status, "COMPLETED"))),
    tx
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
      .from(expenses)
      .where(and(eq(expenses.shiftId, shiftId), eq(expenses.method, "CASH"))),
    // Supplier payments are stored as negative ledger amounts.
    tx
      .select({ total: sql<number>`coalesce(sum(-${supplierLedger.amount}), 0)::int` })
      .from(supplierLedger)
      .where(
        and(eq(supplierLedger.shiftId, shiftId), eq(supplierLedger.type, "PAYMENT"), eq(supplierLedger.method, "CASH")),
      ),
    // Refunds are stored as negative deposits.
    tx
      .select({ total: sql<number>`coalesce(sum(-${emptiesLedger.deposit}), 0)::int` })
      .from(emptiesLedger)
      .where(and(eq(emptiesLedger.shiftId, shiftId), sql`${emptiesLedger.deposit} < 0`)),
  ]);
  return (
    openingFloat +
    Number(cashIn[0]?.total ?? 0) -
    Number(cashExpenses[0]?.total ?? 0) -
    Number(supplierCash[0]?.total ?? 0) -
    Number(depositRefunds[0]?.total ?? 0)
  );
}

/** Closes a shift and records the expected vs counted cash. Uploaded after the shift's own records. */
export async function closeShift(input: ShiftCloseInput, uploader: Uploader): Promise<SyncItemResult> {
  return guarded(input.id, () =>
    db.transaction(async (tx: Tx) => {
      const shift = await tx.query.shifts.findFirst({ where: eq(shifts.id, input.id) });
      if (!shift) return rejected(input.id, "Unknown shift.");
      if (shift.deviceId !== uploader.deviceId) return rejected(input.id, "Shift belongs to a different device.");
      if (shift.status === "CLOSED") return duplicate(input.id);

      const expected = await expectedCash(tx, shift.id, shift.openingFloat);
      await tx
        .update(shifts)
        .set({
          status: "CLOSED",
          closedAt: new Date(input.closedAt),
          closedById: input.closedById,
          countedCash: input.countedCash,
          expectedCash: expected,
          notes: input.notes,
        })
        .where(and(eq(shifts.id, input.id), eq(shifts.status, "OPEN")));
      return created(input.id);
    }),
  );
}
