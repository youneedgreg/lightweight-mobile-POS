import {
  baseQuantities,
  cartTotals,
  type Cart,
  type DraftPayment,
  type PaymentMethod,
  type SaleInput,
} from "@liquor-pos/shared";
import * as Crypto from "expo-crypto";

import { getMeta, inTransaction, setMeta, type Database } from "./database";

const RECEIPT_COUNTER_KEY = "receipt_counter";

export type SaleSyncStatus = "pending" | "synced" | "rejected";

export interface LocalSale {
  id: string;
  receiptNo: string;
  cashierName: string | null;
  customerName: string | null;
  itemCount: number;
  total: number;
  discount: number;
  paymentMethods: PaymentMethod[];
  occurredAt: string;
  syncStatus: SaleSyncStatus;
  syncError: string | null;
}

interface SaleRow {
  id: string;
  receipt_no: string;
  cashier_name: string | null;
  customer_name: string | null;
  item_count: number;
  total: number;
  discount: number;
  payment_methods: string;
  occurred_at: string;
  sync_status: SaleSyncStatus;
  sync_error: string | null;
}

export interface CompleteSaleInput {
  cart: Cart;
  payments: readonly DraftPayment[];
  cashier: { id: string; name: string | null };
  customer: { id: string; name: string } | null;
  deviceId: string;
  receiptPrefix: string;
}

/**
 * Records a completed sale on the phone. In one transaction it allocates the
 * next receipt number, saves the sale to local history, queues it for upload
 * and lowers local stock. Works fully offline.
 */
export async function completeSale(db: Database, input: CompleteSaleInput): Promise<SaleInput> {
  const { cart, payments, cashier, customer, deviceId, receiptPrefix } = input;
  const totals = cartTotals(cart);
  const occurredAt = new Date().toISOString();

  return inTransaction(db, async (tx) => {
    const counter = Number((await getMeta(tx, RECEIPT_COUNTER_KEY)) ?? "0") + 1;
    await setMeta(tx, RECEIPT_COUNTER_KEY, String(counter));
    const receiptNo = `${receiptPrefix}-${String(counter).padStart(6, "0")}`;

    const sale: SaleInput = {
      id: Crypto.randomUUID(),
      receiptNo,
      deviceId,
      cashierId: cashier.id,
      shiftId: null,
      customerId: customer?.id ?? null,
      priceTier: cart.priceTier,
      items: cart.lines.map((line) => ({
        id: Crypto.randomUUID(),
        productId: line.productId,
        productUnitId: line.productUnitId,
        quantity: line.quantity,
        listUnitPrice: line.listUnitPrice,
        unitPrice: line.unitPrice,
      })),
      payments: payments.map((payment) => ({
        id: Crypto.randomUUID(),
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference?.trim() || null,
      })),
      occurredAt,
    };

    await tx.runAsync(
      `INSERT INTO sales (id, receipt_no, cashier_id, cashier_name, customer_id, customer_name, price_tier,
         item_count, total, discount, payment_methods, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale.id, receiptNo, cashier.id, cashier.name, customer?.id ?? null, customer?.name ?? null, cart.priceTier,
        totals.itemCount, totals.total, totals.discount,
        JSON.stringify([...new Set(payments.map((p) => p.method))]), occurredAt],
    );
    await tx.runAsync(
      "INSERT INTO sync_queue (id, kind, payload, created_at) VALUES (?, 'sale', ?, ?)",
      [sale.id, JSON.stringify(sale), occurredAt],
    );
    for (const [productId, bottles] of baseQuantities(cart)) {
      await tx.runAsync("UPDATE products SET stock_on_hand = stock_on_hand - ? WHERE id = ?", [bottles, productId]);
    }
    const credit = payments.filter((p) => p.method === "CREDIT").reduce((sum, p) => sum + p.amount, 0);
    if (credit > 0 && customer) {
      await tx.runAsync("UPDATE customers SET balance = balance + ? WHERE id = ?", [credit, customer.id]);
    }
    return sale;
  });
}

export async function listRecentSales(db: Database, limit = 100): Promise<LocalSale[]> {
  const rows = await db.getAllAsync<SaleRow>("SELECT * FROM sales ORDER BY occurred_at DESC LIMIT ?", limit);
  return rows.map((row) => ({
    id: row.id,
    receiptNo: row.receipt_no,
    cashierName: row.cashier_name,
    customerName: row.customer_name,
    itemCount: row.item_count,
    total: row.total,
    discount: row.discount,
    paymentMethods: JSON.parse(row.payment_methods) as PaymentMethod[],
    occurredAt: row.occurred_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
  }));
}
