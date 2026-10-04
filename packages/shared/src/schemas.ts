import { z } from "zod";

import { PAYMENT_METHODS, PRICE_TIERS } from "./enums";

/**
 * Wire contracts between the mobile app and the Next.js API.
 * Client-generated UUIDs are the idempotency keys for offline sync:
 * re-sending the same record is a no-op on the server.
 */

export const kesSchema = z.number().int().nonnegative();
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const saleItemInputSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  /** Set when sold as a pack (e.g. a full crate). */
  productUnitId: z.uuid().nullable(),
  /** Number of sold units: bottles, or packs if productUnitId is set. */
  quantity: z.number().int().positive(),
  /** Price-list price per sold unit, before any cashier discount. */
  listUnitPrice: kesSchema,
  /** Price actually charged per sold unit. Differs from listUnitPrice when discounted. */
  unitPrice: kesSchema,
});
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const paymentInputSchema = z.object({
  id: z.uuid(),
  method: z.enum(PAYMENT_METHODS),
  amount: kesSchema.positive(),
  /** M-Pesa confirmation code, etc. */
  reference: z.string().trim().max(64).nullable(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

/**
 * Returnable bottles in a sale. The customer either brings empties back in
 * exchange or pays a deposit for each bottle they keep.
 */
export const saleEmptiesInputSchema = z.object({
  productId: z.uuid(),
  /** Empty bottles the customer handed over at the counter. */
  returned: z.number().int().nonnegative(),
  /** Deposit charged for bottles not exchanged. Paid on top of the item total. */
  depositCharged: kesSchema,
});
export type SaleEmptiesInput = z.infer<typeof saleEmptiesInputSchema>;

export const saleInputSchema = z
  .object({
    id: z.uuid(),
    receiptNo: z.string().min(1).max(32),
    deviceId: z.uuid(),
    /**
     * Who made the sale. A phone can queue sales from several cashiers while
     * offline, so this is not inferred from whoever's token uploads it.
     */
    cashierId: z.string().min(1),
    shiftId: z.uuid().nullable(),
    customerId: z.uuid().nullable(),
    priceTier: z.enum(PRICE_TIERS),
    items: z.array(saleItemInputSchema).min(1).max(200),
    payments: z.array(paymentInputSchema).min(1).max(10),
    empties: z.array(saleEmptiesInputSchema).max(200).default([]),
    /** ISO timestamp from the device clock when the sale was completed. */
    occurredAt: isoTimestampSchema,
  })
  .superRefine((sale, ctx) => {
    const itemsTotal = sale.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const deposits = sale.empties.reduce((sum, e) => sum + e.depositCharged, 0);
    const paid = sale.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paid !== itemsTotal + deposits) {
      ctx.addIssue({
        code: "custom",
        path: ["payments"],
        message: `Payments (${paid}) must equal the sale total (${itemsTotal + deposits})`,
      });
    }
    if (sale.payments.some((p) => p.method === "CREDIT") && !sale.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "A customer is required for credit sales",
      });
    }
    const productIds = new Set(sale.items.map((item) => item.productId));
    if (sale.empties.some((e) => !productIds.has(e.productId))) {
      ctx.addIssue({ code: "custom", path: ["empties"], message: "Empties must be for products in the sale" });
    }
  });
export type SaleInput = z.input<typeof saleInputSchema>;

/** A customer created on a phone (possibly offline), uploaded before the records that reference it. */
export const customerInputSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).nullable(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;
