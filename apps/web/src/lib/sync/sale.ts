import "server-only";

import type { saleInputSchema, SyncItemResult } from "@liquor-pos/shared";
import { eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/db";
import {
  customerLedger,
  customers,
  emptiesLedger,
  payments,
  productUnits,
  products,
  saleItems,
  sales,
  stockMovements,
} from "@/db/schema";
import { audit } from "@/lib/audit";

import { created, duplicate, guarded, rejected, type Tx, type Uploader } from "./common";

type Sale = z.output<typeof saleInputSchema>;

/**
 * Stores one sale uploaded from a phone, atomically and idempotently:
 * sale, items, payments, stock movements, cached stock, the customer ledger
 * for credit and the empties ledger for returnable bottles — or nothing.
 *
 * Prices come from the phone (it priced the sale offline, possibly with a
 * cashier discount); stock quantities and cost snapshots are computed here.
 * Stock may go negative; that is flagged on the dashboard, never rejected.
 */
export async function recordSale(sale: Sale, uploader: Uploader): Promise<SyncItemResult> {
  if (sale.deviceId !== uploader.deviceId) {
    return rejected(sale.id, "Sale was made on a different device.");
  }

  const productIds = [...new Set(sale.items.map((item) => item.productId))];
  const unitIds = [...new Set(sale.items.flatMap((item) => (item.productUnitId ? [item.productUnitId] : [])))];

  const [productRows, unitRows] = await Promise.all([
    db
      .select({ id: products.id, costPrice: products.costPrice, isReturnable: products.isReturnable })
      .from(products)
      .where(inArray(products.id, productIds)),
    unitIds.length > 0
      ? db
          .select({ id: productUnits.id, productId: productUnits.productId, unitsPerPack: productUnits.unitsPerPack })
          .from(productUnits)
          .where(inArray(productUnits.id, unitIds))
      : Promise.resolve([]),
  ]);
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const unitById = new Map(unitRows.map((row) => [row.id, row]));

  const lines: Array<Sale["items"][number] & { baseQuantity: number; unitCost: number }> = [];
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

  const bottlesByProduct = new Map<string, number>();
  for (const line of lines) {
    bottlesByProduct.set(line.productId, (bottlesByProduct.get(line.productId) ?? 0) + line.baseQuantity);
  }

  for (const empties of sale.empties) {
    if (!productById.get(empties.productId)?.isReturnable) {
      return rejected(sale.id, "Empties were recorded for a product that isn't returnable.");
    }
    if (empties.returned > (bottlesByProduct.get(empties.productId) ?? 0)) {
      return rejected(sale.id, "More empties returned than bottles sold.");
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.listUnitPrice * line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const costTotal = lines.reduce((sum, line) => sum + line.unitCost * line.baseQuantity, 0);
  const depositTotal = sale.empties.reduce((sum, e) => sum + e.depositCharged, 0);
  const occurredAt = new Date(sale.occurredAt);

  return guarded(sale.id, () =>
    db.transaction(async (tx: Tx): Promise<SyncItemResult> => {
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
          depositTotal,
          occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: sales.id });

      if (inserted.length === 0) {
        // Either this exact sale was uploaded before, or the receipt number clashes with another sale.
        const existing = await tx.query.sales.findFirst({ where: eq(sales.id, sale.id), columns: { id: true } });
        return existing
          ? duplicate(sale.id)
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

      const emptiesRows = sale.empties.flatMap((e) => [
        ...(e.returned > 0
          ? [{ type: "RETURNED_BY_CUSTOMER" as const, productId: e.productId, quantity: e.returned, deposit: 0 }]
          : []),
        ...(e.depositCharged > 0
          ? [{ type: "DEPOSIT_COLLECTED" as const, productId: e.productId, quantity: 0, deposit: e.depositCharged }]
          : []),
      ]);
      if (emptiesRows.length > 0) {
        await tx.insert(emptiesLedger).values(
          emptiesRows.map((row) => ({
            ...row,
            id: crypto.randomUUID(),
            customerId: sale.customerId,
            saleId: sale.id,
            shiftId: sale.shiftId,
            createdById: sale.cashierId,
            occurredAt,
          })),
        );
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

      return created(sale.id);
    }),
  );
}
