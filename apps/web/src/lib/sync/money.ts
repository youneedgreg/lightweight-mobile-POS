import "server-only";

import type {
  CustomerInput,
  CustomerPaymentInput,
  EmptiesReturnInput,
  ExpenseInput,
  LedgerAdjustmentInput,
  SupplierPaymentInput,
  SyncItemResult,
} from "@liquor-pos/shared";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  customerLedger,
  customers,
  emptiesLedger,
  expenses,
  payments,
  products,
  supplierLedger,
  suppliers,
} from "@/db/schema";
import { audit } from "@/lib/audit";

import { created, duplicate, guarded, rejected, type Tx } from "./common";

/** A customer created on a phone. */
export async function createCustomer(input: CustomerInput): Promise<SyncItemResult> {
  return guarded(input.id, async () => {
    const inserted = await db
      .insert(customers)
      .values({ id: input.id, name: input.name, phone: input.phone })
      .onConflictDoNothing({ target: customers.id })
      .returning({ id: customers.id });
    return inserted.length > 0 ? created(input.id) : duplicate(input.id);
  });
}

/** Customer pays down their debt: a payment (counts toward the till) and a negative ledger entry. */
export async function recordCustomerPayment(input: CustomerPaymentInput): Promise<SyncItemResult> {
  const occurredAt = new Date(input.occurredAt);
  return guarded(input.id, () =>
    db.transaction(async (tx: Tx) => {
      const inserted = await tx
        .insert(payments)
        .values({
          id: input.id,
          customerId: input.customerId,
          shiftId: input.shiftId,
          receivedById: input.receivedById,
          method: input.method,
          amount: input.amount,
          reference: input.reference,
          occurredAt,
        })
        .onConflictDoNothing({ target: payments.id })
        .returning({ id: payments.id });
      if (inserted.length === 0) return duplicate(input.id);

      await tx.insert(customerLedger).values({
        id: input.id,
        customerId: input.customerId,
        type: "PAYMENT",
        amount: -input.amount,
        paymentId: input.id,
        createdById: input.receivedById,
        occurredAt,
      });
      await tx.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, input.customerId));
      return created(input.id);
    }),
  );
}

/** Shop pays a supplier. */
export async function recordSupplierPayment(input: SupplierPaymentInput): Promise<SyncItemResult> {
  return guarded(input.id, () =>
    db.transaction(async (tx: Tx) => {
      const inserted = await tx
        .insert(supplierLedger)
        .values({
          id: input.id,
          supplierId: input.supplierId,
          type: "PAYMENT",
          amount: -input.amount,
          method: input.method,
          reference: input.reference,
          shiftId: input.shiftId,
          note: input.note,
          createdById: input.paidById,
          occurredAt: new Date(input.occurredAt),
        })
        .onConflictDoNothing({ target: supplierLedger.id })
        .returning({ id: supplierLedger.id });
      if (inserted.length === 0) return duplicate(input.id);
      await tx.update(suppliers).set({ updatedAt: new Date() }).where(eq(suppliers.id, input.supplierId));
      return created(input.id);
    }),
  );
}

export async function recordExpense(input: ExpenseInput): Promise<SyncItemResult> {
  return guarded(input.id, async () => {
    const inserted = await db
      .insert(expenses)
      .values({
        id: input.id,
        category: input.category,
        description: input.description,
        amount: input.amount,
        method: input.method,
        shiftId: input.shiftId,
        createdById: input.createdById,
        occurredAt: new Date(input.occurredAt),
      })
      .onConflictDoNothing({ target: expenses.id })
      .returning({ id: expenses.id });
    return inserted.length > 0 ? created(input.id) : duplicate(input.id);
  });
}

/** Empties brought back after a sale; the deposit is refunded (negative deposit = money out). */
export async function recordEmptiesReturn(input: EmptiesReturnInput): Promise<SyncItemResult> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
    columns: { isReturnable: true },
  });
  if (!product) return rejected(input.id, "Unknown product.");
  if (!product.isReturnable) return rejected(input.id, "That product's bottles aren't returnable.");

  return guarded(input.id, async () => {
    const inserted = await db
      .insert(emptiesLedger)
      .values({
        id: input.id,
        productId: input.productId,
        type: "RETURNED_BY_CUSTOMER",
        quantity: input.quantity,
        deposit: -input.depositRefunded,
        customerId: input.customerId,
        shiftId: input.shiftId,
        createdById: input.createdById,
        occurredAt: new Date(input.occurredAt),
      })
      .onConflictDoNothing({ target: emptiesLedger.id })
      .returning({ id: emptiesLedger.id });
    return inserted.length > 0 ? created(input.id) : duplicate(input.id);
  });
}

/** Owner-only manual balance correction, always audited. */
export async function recordLedgerAdjustment(input: LedgerAdjustmentInput): Promise<SyncItemResult> {
  const occurredAt = new Date(input.occurredAt);
  return guarded(input.id, () =>
    db.transaction(async (tx: Tx) => {
      const values = {
        id: input.id,
        type: "ADJUSTMENT" as const,
        amount: input.amount,
        note: input.note,
        createdById: input.createdById,
        occurredAt,
      };
      const inserted =
        input.party === "customer"
          ? await tx
              .insert(customerLedger)
              .values({ ...values, customerId: input.partyId })
              .onConflictDoNothing({ target: customerLedger.id })
              .returning({ id: customerLedger.id })
          : await tx
              .insert(supplierLedger)
              .values({ ...values, supplierId: input.partyId })
              .onConflictDoNothing({ target: supplierLedger.id })
              .returning({ id: supplierLedger.id });
      if (inserted.length === 0) return duplicate(input.id);

      if (input.party === "customer") {
        await tx.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, input.partyId));
      } else {
        await tx.update(suppliers).set({ updatedAt: new Date() }).where(eq(suppliers.id, input.partyId));
      }
      await audit(
        {
          userId: input.createdById,
          action: `${input.party}.balance_adjustment`,
          entityType: input.party,
          entityId: input.partyId,
          data: { amount: input.amount, note: input.note },
        },
        tx,
      );
      return created(input.id);
    }),
  );
}
