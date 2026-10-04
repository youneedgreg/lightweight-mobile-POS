import "server-only";

import { and, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  customerLedger,
  devices,
  emptiesLedger,
  expenses,
  payments,
  products,
  saleItems,
  sales,
  shifts,
  supplierLedger,
  users,
} from "@/db/schema";

import { daysIn, SHOP_TIME_ZONE, type DateRange } from "./dates";

/**
 * Owner reports. Revenue is completed sales' item totals (deposits are
 * refundable and excluded); gross profit is revenue minus the cost of goods
 * snapshotted at sale time.
 */

const inRange = (column: PgColumn, range: DateRange) =>
  and(gte(column, range.from), lt(column, range.to));
const completed = eq(sales.status, "COMPLETED");
const int = (expression: ReturnType<typeof sql>) => sql<number>`coalesce(${expression}, 0)::int`;

export interface Summary {
  saleCount: number;
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  discounts: number;
  deposits: number;
  expenses: number;
  /** Gross profit minus expenses. */
  net: number;
}

export async function summary(range: DateRange): Promise<Summary> {
  const [[s], [e]] = await Promise.all([
    db
      .select({
        saleCount: sql<number>`count(*)::int`,
        revenue: int(sql`sum(${sales.total})`),
        costOfGoods: int(sql`sum(${sales.costTotal})`),
        discounts: int(sql`sum(${sales.discountTotal})`),
        deposits: int(sql`sum(${sales.depositTotal})`),
      })
      .from(sales)
      .where(and(completed, inRange(sales.occurredAt, range))),
    db
      .select({ total: int(sql`sum(${expenses.amount})`) })
      .from(expenses)
      .where(inRange(expenses.occurredAt, range)),
  ]);
  const revenue = s?.revenue ?? 0;
  const costOfGoods = s?.costOfGoods ?? 0;
  const expenseTotal = e?.total ?? 0;
  return {
    saleCount: s?.saleCount ?? 0,
    revenue,
    costOfGoods,
    grossProfit: revenue - costOfGoods,
    discounts: s?.discounts ?? 0,
    deposits: s?.deposits ?? 0,
    expenses: expenseTotal,
    net: revenue - costOfGoods - expenseTotal,
  };
}

export interface PaymentMix {
  method: "CASH" | "MPESA" | "CREDIT";
  /** Taken at the till for sales (incl. deposits). */
  sales: number;
  /** Customers paying down debt. */
  debtRepayments: number;
}

export async function paymentMix(range: DateRange): Promise<PaymentMix[]> {
  const rows = await db
    .select({
      method: payments.method,
      sales: int(sql`sum(case when ${payments.saleId} is not null then ${payments.amount} end)`),
      debtRepayments: int(sql`sum(case when ${payments.saleId} is null then ${payments.amount} end)`),
    })
    .from(payments)
    .leftJoin(sales, eq(sales.id, payments.saleId))
    .where(
      and(
        inRange(payments.occurredAt, range),
        eq(payments.status, "COMPLETED"),
        sql`(${payments.saleId} is null or ${sales.status} = 'COMPLETED')`,
      ),
    )
    .groupBy(payments.method);
  return (["CASH", "MPESA", "CREDIT"] as const).map((method) => {
    const row = rows.find((r) => r.method === method);
    return { method, sales: row?.sales ?? 0, debtRepayments: row?.debtRepayments ?? 0 };
  });
}

export interface DailyPoint {
  day: string;
  revenue: number;
  grossProfit: number;
  saleCount: number;
}

export async function dailySales(range: DateRange): Promise<DailyPoint[]> {
  // Inlined (not a bind parameter) so the SELECT and GROUP BY expressions are identical to Postgres.
  // SHOP_TIME_ZONE is a constant, never user input.
  const day = sql<string>`to_char(${sales.occurredAt} at time zone ${sql.raw(`'${SHOP_TIME_ZONE}'`)}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      revenue: int(sql`sum(${sales.total})`),
      cost: int(sql`sum(${sales.costTotal})`),
      saleCount: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(completed, inRange(sales.occurredAt, range)))
    .groupBy(day);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return daysIn(range).map((d) => {
    const row = byDay.get(d);
    return { day: d, revenue: row?.revenue ?? 0, grossProfit: (row?.revenue ?? 0) - (row?.cost ?? 0), saleCount: row?.saleCount ?? 0 };
  });
}

export async function topProducts(range: DateRange, limit = 10) {
  return db
    .select({
      productId: saleItems.productId,
      name: products.name,
      size: products.size,
      bottles: sql<number>`sum(${saleItems.baseQuantity})::int`,
      revenue: int(sql`sum(${saleItems.lineTotal})`),
      grossProfit: int(sql`sum(${saleItems.lineTotal} - ${saleItems.unitCost} * ${saleItems.baseQuantity})`),
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(and(completed, inRange(sales.occurredAt, range)))
    .groupBy(saleItems.productId, products.name, products.size)
    .orderBy(desc(sql`sum(${saleItems.lineTotal})`))
    .limit(limit);
}

export async function salesByCashier(range: DateRange) {
  return db
    .select({
      cashierId: sales.cashierId,
      name: users.name,
      saleCount: sql<number>`count(*)::int`,
      revenue: int(sql`sum(${sales.total})`),
      discounts: int(sql`sum(${sales.discountTotal})`),
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .where(and(completed, inRange(sales.occurredAt, range)))
    .groupBy(sales.cashierId, users.name)
    .orderBy(desc(sql`sum(${sales.total})`));
}

/** Money owed both ways and deposits held, right now (not range-bound). */
export async function balances() {
  const [[customers], [suppliers], [deposits]] = await Promise.all([
    db.select({ owedToUs: int(sql`sum(greatest(b.balance, 0))`) }).from(
      db
        .select({ balance: sql<number>`sum(${customerLedger.amount})`.as("balance") })
        .from(customerLedger)
        .groupBy(customerLedger.customerId)
        .as("b"),
    ),
    db.select({ weOwe: int(sql`sum(greatest(b.balance, 0))`) }).from(
      db
        .select({ balance: sql<number>`sum(${supplierLedger.amount})`.as("balance") })
        .from(supplierLedger)
        .groupBy(supplierLedger.supplierId)
        .as("b"),
    ),
    db.select({ held: int(sql`sum(${emptiesLedger.deposit})`) }).from(emptiesLedger),
  ]);
  return { owedToUs: customers?.owedToUs ?? 0, weOwe: suppliers?.weOwe ?? 0, depositsHeld: deposits?.held ?? 0 };
}

/** Stock problems: negative (sold more than recorded) and below reorder level. */
export async function stockAlerts() {
  const columns = {
    id: products.id,
    name: products.name,
    size: products.size,
    stockOnHand: products.stockOnHand,
    reorderLevel: products.reorderLevel,
  };
  const [negative, low] = await Promise.all([
    db
      .select(columns)
      .from(products)
      .where(and(eq(products.isActive, true), lt(products.stockOnHand, 0)))
      .orderBy(products.stockOnHand),
    db
      .select(columns)
      .from(products)
      .where(and(eq(products.isActive, true), gte(products.stockOnHand, 0), lt(products.stockOnHand, products.reorderLevel)))
      .orderBy(products.stockOnHand),
  ]);
  return { negative, low };
}

export async function shiftList(range: DateRange, options: { onlyDiscrepancies?: boolean; limit?: number } = {}) {
  const difference = sql<number>`(${shifts.countedCash} - ${shifts.expectedCash})`;
  return db
    .select({
      id: shifts.id,
      status: shifts.status,
      cashier: users.name,
      device: devices.label,
      openedAt: shifts.openedAt,
      closedAt: shifts.closedAt,
      openingFloat: shifts.openingFloat,
      expectedCash: shifts.expectedCash,
      countedCash: shifts.countedCash,
      difference,
      notes: shifts.notes,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.cashierId))
    .innerJoin(devices, eq(devices.id, shifts.deviceId))
    .where(
      and(
        gte(shifts.openedAt, range.from),
        lt(shifts.openedAt, range.to),
        options.onlyDiscrepancies ? and(eq(shifts.status, "CLOSED"), ne(difference, 0)) : undefined,
      ),
    )
    .orderBy(desc(shifts.openedAt))
    .limit(options.limit ?? 200);
}

/** Shifts still open (e.g. a phone forgot to close, or hasn't synced the close yet). */
export async function openShifts() {
  return db
    .select({ id: shifts.id, cashier: users.name, device: devices.label, openedAt: shifts.openedAt })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.cashierId))
    .innerJoin(devices, eq(devices.id, shifts.deviceId))
    .where(and(eq(shifts.status, "OPEN"), isNull(shifts.closedAt)))
    .orderBy(shifts.openedAt);
}

/** Phones that haven't uploaded for `maxAgeMs`: their latest sales aren't in the numbers yet. */
export async function staleDevices(maxAgeMs: number) {
  const olderThan = new Date(Date.now() - maxAgeMs);
  return db
    .select({ id: devices.id, label: devices.label, receiptPrefix: devices.receiptPrefix, lastSyncedAt: devices.lastSyncedAt })
    .from(devices)
    .where(and(eq(devices.isActive, true), sql`${devices.lastSyncedAt} is null or ${devices.lastSyncedAt} < ${olderThan}`));
}

export async function expenseList(range: DateRange) {
  return db
    .select({
      id: expenses.id,
      category: expenses.category,
      description: expenses.description,
      amount: expenses.amount,
      method: expenses.method,
      occurredAt: expenses.occurredAt,
      by: users.name,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.createdById))
    .where(inRange(expenses.occurredAt, range))
    .orderBy(desc(expenses.occurredAt));
}

export async function saleList(range: DateRange, limit = 300) {
  return db
    .select({
      id: sales.id,
      receiptNo: sales.receiptNo,
      occurredAt: sales.occurredAt,
      total: sales.total,
      depositTotal: sales.depositTotal,
      discountTotal: sales.discountTotal,
      grossProfit: sql<number>`(${sales.total} - ${sales.costTotal})::int`,
      status: sales.status,
      cashier: users.name,
      methods: sql<string>`(select string_agg(distinct ${payments.method}::text, ' + ') from ${payments} where ${payments.saleId} = ${sales.id})`,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .where(inRange(sales.occurredAt, range))
    .orderBy(desc(sales.occurredAt))
    .limit(limit);
}

