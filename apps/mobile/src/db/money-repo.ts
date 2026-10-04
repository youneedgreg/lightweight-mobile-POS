import type { ExpenseCategory, MoneyMethod } from "@liquor-pos/shared";
import * as Crypto from "expo-crypto";

import type { Session } from "@/auth/session-storage";

import { inTransaction, type Database } from "./database";
import { enqueue } from "./outbox";
import { getCurrentShift, recordCash } from "./shift-repo";

/**
 * Money that moves outside a sale. Every function applies the change to the
 * local copy (balances, stock, till) and queues it for upload in one
 * transaction, so it works offline and the screen is correct immediately.
 */

const now = () => new Date().toISOString();

export async function recordCustomerPayment(
  db: Database,
  session: Session,
  input: { customerId: string; customerName: string; method: MoneyMethod; amount: number; reference: string | null },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    const shift = await getCurrentShift(tx);
    const id = Crypto.randomUUID();
    await enqueue(
      tx,
      "customer_payment",
      {
        id,
        customerId: input.customerId,
        receivedById: session.user.id,
        shiftId: shift?.id ?? null,
        method: input.method,
        amount: input.amount,
        reference: input.reference,
        occurredAt: now(),
      },
      `${input.customerName} paid ${input.amount}`,
    );
    await tx.runAsync("UPDATE customers SET balance = balance - ? WHERE id = ?", [input.amount, input.customerId]);
    if (input.method === "CASH") {
      await recordCash(tx, shift?.id ?? null, "DEBT_PAYMENT", input.amount, input.customerName);
    }
  });
}

export async function recordSupplierPayment(
  db: Database,
  session: Session,
  input: {
    supplierId: string;
    supplierName: string;
    method: MoneyMethod;
    amount: number;
    reference: string | null;
    note: string | null;
  },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    const shift = await getCurrentShift(tx);
    await enqueue(
      tx,
      "supplier_payment",
      {
        id: Crypto.randomUUID(),
        supplierId: input.supplierId,
        paidById: session.user.id,
        shiftId: shift?.id ?? null,
        method: input.method,
        amount: input.amount,
        reference: input.reference,
        note: input.note,
        occurredAt: now(),
      },
      `Paid ${input.supplierName} ${input.amount}`,
    );
    await tx.runAsync("UPDATE suppliers SET balance = balance - ? WHERE id = ?", [input.amount, input.supplierId]);
    if (input.method === "CASH") {
      await recordCash(tx, shift?.id ?? null, "SUPPLIER_PAYMENT", -input.amount, input.supplierName);
    }
  });
}

export async function recordExpense(
  db: Database,
  session: Session,
  input: { category: ExpenseCategory; description: string; amount: number; method: MoneyMethod },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    const shift = await getCurrentShift(tx);
    await enqueue(
      tx,
      "expense",
      {
        id: Crypto.randomUUID(),
        category: input.category,
        description: input.description,
        amount: input.amount,
        method: input.method,
        shiftId: shift?.id ?? null,
        createdById: session.user.id,
        occurredAt: now(),
      },
      `Expense ${input.amount}: ${input.description}`,
    );
    if (input.method === "CASH") {
      await recordCash(tx, shift?.id ?? null, "EXPENSE", -input.amount, input.description);
    }
  });
}

/** Empties brought back after a sale; the deposit is refunded in cash. */
export async function recordEmptiesReturn(
  db: Database,
  session: Session,
  input: { productId: string; productName: string; quantity: number; depositRefunded: number },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    const shift = await getCurrentShift(tx);
    await enqueue(
      tx,
      "empties_return",
      {
        id: Crypto.randomUUID(),
        productId: input.productId,
        quantity: input.quantity,
        depositRefunded: input.depositRefunded,
        customerId: null,
        shiftId: shift?.id ?? null,
        createdById: session.user.id,
        occurredAt: now(),
      },
      `${input.quantity} empty ${input.productName} returned`,
    );
    await recordCash(tx, shift?.id ?? null, "DEPOSIT_REFUND", -input.depositRefunded, input.productName);
  });
}

/** Owner-only manual correction. Positive amount = they owe more. */
export async function recordLedgerAdjustment(
  db: Database,
  session: Session,
  input: { party: "customer" | "supplier"; partyId: string; partyName: string; amount: number; note: string },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    await enqueue(
      tx,
      "ledger_adjustment",
      {
        id: Crypto.randomUUID(),
        party: input.party,
        partyId: input.partyId,
        amount: input.amount,
        note: input.note,
        createdById: session.user.id,
        occurredAt: now(),
      },
      `Adjusted ${input.partyName} by ${input.amount}`,
    );
    const table = input.party === "customer" ? "customers" : "suppliers";
    await tx.runAsync(`UPDATE ${table} SET balance = balance + ? WHERE id = ?`, [input.amount, input.partyId]);
  });
}

export interface IntakeLine {
  productId: string;
  productUnitId: string | null;
  name: string;
  quantity: number;
  /** 1 for bottles, unitsPerPack for crates/cartons. */
  unitsPerPack: number;
  unitCost: number;
}

/** Owner receives stock. Packs are broken into bottles; the supplier is owed what wasn't paid. */
export async function recordIntake(
  db: Database,
  session: Session,
  input: {
    supplier: { id: string; name: string } | null;
    invoiceRef: string | null;
    lines: readonly IntakeLine[];
    amountPaid: number;
    paymentMethod: MoneyMethod | null;
    paymentReference: string | null;
  },
): Promise<void> {
  const total = input.lines.reduce((sum, line) => sum + line.quantity * line.unitsPerPack * line.unitCost, 0);
  await inTransaction(db, async (tx) => {
    const shift = await getCurrentShift(tx);
    await enqueue(
      tx,
      "intake",
      {
        id: Crypto.randomUUID(),
        supplierId: input.supplier?.id ?? null,
        receivedById: session.user.id,
        shiftId: shift?.id ?? null,
        invoiceRef: input.invoiceRef,
        items: input.lines.map((line) => ({
          id: Crypto.randomUUID(),
          productId: line.productId,
          productUnitId: line.productUnitId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
        amountPaid: input.amountPaid,
        paymentMethod: input.amountPaid > 0 ? input.paymentMethod : null,
        paymentReference: input.paymentReference,
        notes: null,
        occurredAt: now(),
      },
      `Stock received${input.supplier ? ` from ${input.supplier.name}` : ""} (${total})`,
    );
    for (const line of input.lines) {
      await tx.runAsync("UPDATE products SET stock_on_hand = stock_on_hand + ?, cost_price = ? WHERE id = ?", [
        line.quantity * line.unitsPerPack,
        line.unitCost,
        line.productId,
      ]);
    }
    if (input.supplier) {
      await tx.runAsync("UPDATE suppliers SET balance = balance + ? WHERE id = ?", [total - input.amountPaid, input.supplier.id]);
    }
    if (input.amountPaid > 0 && input.paymentMethod === "CASH") {
      await recordCash(tx, shift?.id ?? null, "SUPPLIER_PAYMENT", -input.amountPaid, input.supplier?.name ?? "Delivery");
    }
  });
}

export interface LocalExpense {
  id: string;
  description: string | null;
  amount: number;
  occurredAt: string;
}

/** Cash expenses recorded in the current shift, newest first. */
export async function listShiftExpenses(db: Database, shiftId: string): Promise<LocalExpense[]> {
  const rows = await db.getAllAsync<{ id: string; description: string | null; amount: number; occurred_at: string }>(
    "SELECT id, description, amount, occurred_at FROM cash_movements WHERE shift_id = ? AND kind = 'EXPENSE' ORDER BY occurred_at DESC",
    shiftId,
  );
  return rows.map((row) => ({ id: row.id, description: row.description, amount: -row.amount, occurredAt: row.occurred_at }));
}
