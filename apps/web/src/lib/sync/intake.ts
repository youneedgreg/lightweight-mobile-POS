import "server-only";

import type { IntakeInput, SyncItemResult } from "@liquor-pos/shared";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { productUnits, products, stockIntakeItems, stockIntakes, stockMovements, supplierLedger, suppliers } from "@/db/schema";
import { audit } from "@/lib/audit";

import { created, duplicate, guarded, rejected, type Tx } from "./common";

/**
 * Stock received from a supplier. Packs are broken into bottles here
 * (5 crates of 24 → +120 bottles). Each product's cost price becomes the
 * latest per-bottle cost. The supplier is owed the total minus what was paid
 * on delivery.
 */
export async function recordIntake(input: IntakeInput): Promise<SyncItemResult> {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const unitIds = [...new Set(input.items.flatMap((item) => (item.productUnitId ? [item.productUnitId] : [])))];

  const [productRows, unitRows] = await Promise.all([
    db.select({ id: products.id }).from(products).where(inArray(products.id, productIds)),
    unitIds.length > 0
      ? db
          .select({ id: productUnits.id, productId: productUnits.productId, unitsPerPack: productUnits.unitsPerPack })
          .from(productUnits)
          .where(inArray(productUnits.id, unitIds))
      : Promise.resolve([]),
  ]);
  const known = new Set(productRows.map((row) => row.id));
  const unitById = new Map(unitRows.map((row) => [row.id, row]));

  const lines: Array<IntakeInput["items"][number] & { baseQuantity: number; lineTotal: number }> = [];
  for (const item of input.items) {
    if (!known.has(item.productId)) return rejected(input.id, `Unknown product ${item.productId}.`);
    let unitsPerPack = 1;
    if (item.productUnitId) {
      const unit = unitById.get(item.productUnitId);
      if (!unit || unit.productId !== item.productId) return rejected(input.id, "Unknown pack in intake.");
      unitsPerPack = unit.unitsPerPack;
    }
    const baseQuantity = item.quantity * unitsPerPack;
    lines.push({ ...item, baseQuantity, lineTotal: baseQuantity * item.unitCost });
  }

  const totalCost = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (input.amountPaid > totalCost) return rejected(input.id, "Amount paid is more than the intake total.");
  if (input.amountPaid > 0 && !input.paymentMethod) return rejected(input.id, "Say how the supplier was paid.");
  if (!input.supplierId && input.amountPaid < totalCost) {
    return rejected(input.id, "Pick a supplier when the delivery isn't paid in full.");
  }
  const occurredAt = new Date(input.occurredAt);

  return guarded(input.id, () =>
    db.transaction(async (tx: Tx) => {
      const inserted = await tx
        .insert(stockIntakes)
        .values({
          id: input.id,
          supplierId: input.supplierId,
          receivedById: input.receivedById,
          invoiceRef: input.invoiceRef,
          totalCost,
          amountPaid: input.amountPaid,
          shiftId: input.shiftId,
          notes: input.notes,
          occurredAt,
        })
        .onConflictDoNothing({ target: stockIntakes.id })
        .returning({ id: stockIntakes.id });
      if (inserted.length === 0) return duplicate(input.id);

      await tx.insert(stockIntakeItems).values(
        lines.map((line) => ({
          id: line.id,
          intakeId: input.id,
          productId: line.productId,
          productUnitId: line.productUnitId,
          quantity: line.quantity,
          baseQuantity: line.baseQuantity,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        })),
      );

      const bottlesByProduct = new Map<string, { bottles: number; unitCost: number }>();
      for (const line of lines) {
        const current = bottlesByProduct.get(line.productId);
        // The last line's cost wins when a product appears twice.
        bottlesByProduct.set(line.productId, {
          bottles: (current?.bottles ?? 0) + line.baseQuantity,
          unitCost: line.unitCost,
        });
      }
      await tx.insert(stockMovements).values(
        [...bottlesByProduct].map(([productId, { bottles }]) => ({
          productId,
          type: "INTAKE" as const,
          quantity: bottles,
          intakeId: input.id,
          userId: input.receivedById,
          occurredAt,
        })),
      );
      for (const [productId, { bottles, unitCost }] of bottlesByProduct) {
        await tx
          .update(products)
          .set({ stockOnHand: sql`${products.stockOnHand} + ${bottles}`, costPrice: unitCost })
          .where(eq(products.id, productId));
      }

      if (input.supplierId) {
        await tx.insert(supplierLedger).values([
          {
            id: input.id,
            supplierId: input.supplierId,
            type: "PURCHASE" as const,
            amount: totalCost,
            intakeId: input.id,
            reference: input.invoiceRef,
            createdById: input.receivedById,
            occurredAt,
          },
          ...(input.amountPaid > 0
            ? [
                {
                  id: crypto.randomUUID(),
                  supplierId: input.supplierId,
                  type: "PAYMENT" as const,
                  amount: -input.amountPaid,
                  intakeId: input.id,
                  method: input.paymentMethod,
                  reference: input.paymentReference,
                  shiftId: input.shiftId,
                  note: "Paid on delivery",
                  createdById: input.receivedById,
                  occurredAt,
                },
              ]
            : []),
        ]);
        await tx.update(suppliers).set({ updatedAt: new Date() }).where(eq(suppliers.id, input.supplierId));
      }

      await audit(
        {
          userId: input.receivedById,
          action: "stock.intake",
          entityType: "stock_intake",
          entityId: input.id,
          data: { totalCost, amountPaid: input.amountPaid, items: lines.length },
        },
        tx,
      );
      return created(input.id);
    }),
  );
}
