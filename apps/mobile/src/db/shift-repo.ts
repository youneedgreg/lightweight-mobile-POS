import * as Crypto from "expo-crypto";

import type { Session } from "@/auth/session-storage";

import { getMeta, inTransaction, setMeta, type Database, type Executor } from "./database";
import { enqueue } from "./outbox";

const CURRENT_SHIFT_KEY = "current_shift";

/** The till session on this phone. One open shift per phone at a time. */
export interface Shift {
  id: string;
  openedAt: string;
  openingFloat: number;
  cashierId: string;
  cashierName: string | null;
}

export type CashKind =
  | "SALE"
  | "DEBT_PAYMENT"
  | "EXPENSE"
  | "SUPPLIER_PAYMENT"
  | "DEPOSIT_REFUND";

export const CASH_KIND_LABEL: Record<CashKind, string> = {
  SALE: "Cash sales (incl. deposits)",
  DEBT_PAYMENT: "Debt repayments",
  EXPENSE: "Expenses",
  SUPPLIER_PAYMENT: "Paid to suppliers",
  DEPOSIT_REFUND: "Deposits refunded",
};

export async function getCurrentShift(db: Executor): Promise<Shift | null> {
  const raw = await getMeta(db, CURRENT_SHIFT_KEY);
  return raw ? (JSON.parse(raw) as Shift) : null;
}

export async function openShift(db: Database, session: Session, openingFloat: number): Promise<Shift> {
  const shift: Shift = {
    id: Crypto.randomUUID(),
    openedAt: new Date().toISOString(),
    openingFloat,
    cashierId: session.user.id,
    cashierName: session.user.name,
  };
  await inTransaction(db, async (tx) => {
    if (await getCurrentShift(tx)) throw new Error("A shift is already open on this phone.");
    await setMeta(tx, CURRENT_SHIFT_KEY, JSON.stringify(shift));
    await enqueue(
      tx,
      "shift_open",
      {
        id: shift.id,
        deviceId: session.device.id,
        cashierId: shift.cashierId,
        openingFloat,
        openedAt: shift.openedAt,
      },
      `Shift opened with float ${openingFloat}`,
    );
  });
  return shift;
}

/** Records cash entering (positive) or leaving (negative) the drawer during the open shift. */
export async function recordCash(
  tx: Executor,
  shiftId: string | null,
  kind: CashKind,
  amount: number,
  description: string | null,
): Promise<void> {
  if (!shiftId || amount === 0) return;
  await tx.runAsync(
    "INSERT INTO cash_movements (id, shift_id, kind, amount, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
    [Crypto.randomUUID(), shiftId, kind, amount, description, new Date().toISOString()],
  );
}

export interface ShiftSummary {
  openingFloat: number;
  byKind: { kind: CashKind; amount: number }[];
  expectedCash: number;
}

/** Expected cash in the drawer: float plus every recorded cash movement. Mirrors the server's calculation. */
export async function summarizeShift(db: Executor, shift: Shift): Promise<ShiftSummary> {
  const rows = await db.getAllAsync<{ kind: CashKind; amount: number }>(
    "SELECT kind, SUM(amount) AS amount FROM cash_movements WHERE shift_id = ? GROUP BY kind",
    shift.id,
  );
  const order = Object.keys(CASH_KIND_LABEL) as CashKind[];
  const byKind = order.map((kind) => ({ kind, amount: rows.find((r) => r.kind === kind)?.amount ?? 0 }));
  const expectedCash = shift.openingFloat + byKind.reduce((sum, row) => sum + row.amount, 0);
  return { openingFloat: shift.openingFloat, byKind, expectedCash };
}

export async function closeShift(
  db: Database,
  session: Session,
  { countedCash, notes }: { countedCash: number; notes: string | null },
): Promise<ShiftSummary & { countedCash: number }> {
  return inTransaction(db, async (tx) => {
    const shift = await getCurrentShift(tx);
    if (!shift) throw new Error("No shift is open.");
    const summary = await summarizeShift(tx, shift);
    await enqueue(
      tx,
      "shift_close",
      { id: shift.id, closedById: session.user.id, countedCash, closedAt: new Date().toISOString(), notes },
      `Shift closed, counted ${countedCash}`,
    );
    await tx.runAsync("DELETE FROM meta WHERE key = ?", CURRENT_SHIFT_KEY);
    return { ...summary, countedCash };
  });
}
