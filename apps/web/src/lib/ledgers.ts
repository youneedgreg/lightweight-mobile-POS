import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { customerLedger, customers, supplierLedger, suppliers, users } from "@/db/schema";

/** Customers with what they owe us (SUM of their ledger), largest debt first. */
export async function customersWithBalances() {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      type: customers.type,
      priceTier: customers.priceTier,
      creditLimit: customers.creditLimit,
      isActive: customers.isActive,
      balance: sql<number>`coalesce(sum(${customerLedger.amount}), 0)::int`,
    })
    .from(customers)
    .leftJoin(customerLedger, eq(customerLedger.customerId, customers.id))
    .groupBy(customers.id)
    .orderBy(desc(sql`coalesce(sum(${customerLedger.amount}), 0)`), customers.name);
}

/** Suppliers with what we owe them, largest first. */
export async function suppliersWithBalances() {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      isActive: suppliers.isActive,
      balance: sql<number>`coalesce(sum(${supplierLedger.amount}), 0)::int`,
    })
    .from(suppliers)
    .leftJoin(supplierLedger, eq(supplierLedger.supplierId, suppliers.id))
    .groupBy(suppliers.id)
    .orderBy(desc(sql`coalesce(sum(${supplierLedger.amount}), 0)`), suppliers.name);
}

export async function customerLedgerEntries(customerId: string, limit = 100) {
  return db
    .select({
      id: customerLedger.id,
      type: customerLedger.type,
      amount: customerLedger.amount,
      note: customerLedger.note,
      occurredAt: customerLedger.occurredAt,
      by: users.name,
    })
    .from(customerLedger)
    .leftJoin(users, eq(users.id, customerLedger.createdById))
    .where(eq(customerLedger.customerId, customerId))
    .orderBy(desc(customerLedger.occurredAt))
    .limit(limit);
}

export async function supplierLedgerEntries(supplierId: string, limit = 100) {
  return db
    .select({
      id: supplierLedger.id,
      type: supplierLedger.type,
      amount: supplierLedger.amount,
      note: supplierLedger.note,
      reference: supplierLedger.reference,
      method: supplierLedger.method,
      occurredAt: supplierLedger.occurredAt,
      by: users.name,
    })
    .from(supplierLedger)
    .leftJoin(users, eq(users.id, supplierLedger.createdById))
    .where(eq(supplierLedger.supplierId, supplierId))
    .orderBy(desc(supplierLedger.occurredAt))
    .limit(limit);
}
