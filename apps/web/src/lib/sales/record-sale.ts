import "server-only";

import type { SaleInput, SyncItemResult } from "@liquor-pos/shared";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customerLedger,
  customers,
  payments,
  productUnits,
  products,
  saleItems,
  sales,
  stockMovements,
} from "@/db/schema";
import { audit } from "@/lib/audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function pgErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  // Drizzle wraps driver errors; the Postgres error is the cause.
  if ("cause" in error) return pgErrorCode(error.cause);
  return null;
}

const rejected = (id: string, message: string): SyncItemResult => ({ id, status: "rejected", message });

/**
 * Stores one sale uploaded from a phone, atomically and idempotently:
 * sale, items, payments, stock movements, cached stock and the customer
 * ledger for credit — or nothing at all.
 *
 * Prices come from the phone (it priced the sale offline, possibly with a
 * cashier discount); stock quantities and cost snapshots are computed here.
 * Stock may go negative; that is flagged on the dashboard, never rejected.
 */
export async function recordSale(sale: SaleInput, uploaderDeviceId: string): Promise<SyncItemResult> {
  if (sale.deviceId !== uploaderDeviceId) {
    return rejected(sale.id, "Sale was made on a different device.");
  }

  const productIds = [...new Set(sale.items.map((item) => item.productId))];
  const unitIds = [...new Set(sale.items.flatMap((item) => (item.productUnitId ? [item.productUnitId] : [])))];

  const [productRows, unitRows] = await Promise.all([
    db.select({ id: products.id, costPrice: products.costPrice }).from(products).where(inArray(products.id, productIds)),
    unitIds.length > 0
      ? db
          .select({ id: productUnits.id, productId: productUnits.productId, unitsPerPack: productUnits.unitsPerPack })
          .from(productUnits)
          .where(inArray(productUnits.id, unitIds))
      : Promise.resolve([]),
  ]);
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const unitById = new Map(unitRows.map((row) => [row.id, row]));

  const lines: Array<SaleInput["items"][number] & { baseQuantity: number; unitCost: number }> = [];
  for (const item of sale.items) {
    const product = productById.get(item.productId);
    if (!product) return rejected(sale.id, `Unknown product ${item.productId}.`);
    let unitsPerPack = 1;
    if (item.productUnitId) {
      const unit = unitById.get(item.productUnitId);
      if (!unit || unit.productId !== item.productId) {
        return rejected(sale.id, `Unknown pack ${item.productUnitId} for product ${item.productId}.`);
      }
      unitsPerPack = unit.unitsPerPack;
    }
    lines.push({ ...item, baseQuantity: item.quantity * unitsPerPack, unitCost: product.costPrice });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.listUnitPrice * line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const costTotal = lines.reduce((sum, line) => sum + line.unitCost * line.baseQuantity, 0);
  const occurredAt = new Date(sale.occurredAt);

  const bottlesByProduct = new Map<string, number>();
  for (const line of lines) {
    bottlesByProduct.set(line.productId, (bottlesByProduct.get(line.productId) ?? 0) + line.baseQuantity);
  }

  try {
    return await db.transaction(async (tx: Tx): Promise<SyncItemResult> => {
      const inserted = await tx
        .insert(sales)
        .values({
          id: sale.id,
          receiptNo: sale.receiptNo,
          deviceId: sale.deviceId,
          shiftId: sale.shiftId,
          cashierId: sale.cashierId,
          customerId: sale.customerId,
          priceTier: sale.priceTier,
          subtotal,
          discountTotal: subtotal - total,
          total,
          costTotal,
          occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: sales.id });

      if (inserted.length === 0) {
        // Either this exact sale was uploaded before, or the receipt number clashes with another sale.
        const existing = await tx.query.sales.findFirst({ where: eq(sales.id, sale.id), columns: { id: true } });
        return existing
          ? { id: sale.id, status: "duplicate", message: null }
          : rejected(sale.id, `Receipt number ${sale.receiptNo} is already used by another sale.`);
      }

      await tx.insert(saleItems).values(
        lines.map((line) => ({
          id: line.id,
          saleId: sale.id,
          productId: line.productId,
          productUnitId: line.productUnitId,
          quantity: line.quantity,
          baseQuantity: line.baseQuantity,
          listUnitPrice: line.listUnitPrice,
          unitPrice: line.unitPrice,
          lineTotal: line.unitPrice * line.quantity,
          unitCost: line.unitCost,
        })),
      );

      await tx.insert(payments).values(
        sale.payments.map((payment) => ({
          id: payment.id,
          saleId: sale.id,
          customerId: payment.method === "CREDIT" ? sale.customerId : null,
          shiftId: sale.shiftId,
          receivedById: sale.cashierId,
          method: payment.method,
          amount: payment.amount,
          reference: payment.reference,
          occurredAt,
        })),
      );

      await tx.insert(stockMovements).values(
        [...bottlesByProduct].map(([productId, bottles]) => ({
          productId,
          type: "SALE" as const,
          quantity: -bottles,
          saleId: sale.id,
          userId: sale.cashierId,
          deviceId: sale.deviceId,
          occurredAt,
        })),
      );
      for (const [productId, bottles] of bottlesByProduct) {
        // Atomic decrement; also bumps updated_at so every phone pulls the new stock level.
        await tx
          .update(products)
          .set({ stockOnHand: sql`${products.stockOnHand} - ${bottles}` })
          .where(eq(products.id, productId));
      }

      const credit = sale.payments.filter((payment) => payment.method === "CREDIT");
      if (credit.length > 0 && sale.customerId) {
        await tx.insert(customerLedger).values(
          credit.map((payment) => ({
            id: payment.id,
            customerId: sale.customerId as string,
            type: "CREDIT_SALE" as const,
            amount: payment.amount,
            saleId: sale.id,
            paymentId: payment.id,
            createdById: sale.cashierId,
            occurredAt,
          })),
        );
        // Bump updated_at so phones pull the customer's new balance.
        await tx.update(customers).set({ updatedAt: new Date() }).where(eq(customers.id, sale.customerId));
      }

      const overrides = lines.filter((line) => line.unitPrice !== line.listUnitPrice);
      if (overrides.length > 0) {
        await audit(
          {
            userId: sale.cashierId,
            action: "sale.price_override",
            entityType: "sale",
            entityId: sale.id,
            data: {
              receiptNo: sale.receiptNo,
              discountTotal: subtotal - total,
              lines: overrides.map(({ productId, productUnitId, quantity, listUnitPrice, unitPrice }) => ({
                productId,
                productUnitId,
                quantity,
                listUnitPrice,
                unitPrice,
              })),
            },
          },
          tx,
        );
      }

      return { id: sale.id, status: "created", message: null };
    });
  } catch (error) {
    if (pgErrorCode(error) === "23503") {
      return rejected(sale.id, "Sale refers to a cashier, customer or shift the server doesn't know.");
    }
    if (pgErrorCode(error) === "23505") {
      return rejected(sale.id, "A line or payment id in this sale is already used by another sale.");
    }
    throw error;
  }
}
