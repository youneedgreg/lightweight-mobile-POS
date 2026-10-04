import { z } from "zod";

import { PAYMENT_METHODS, PRICE_TIERS } from "./enums";

/**
 * Wire contracts between the mobile app and the Next.js API.
 * Client-generated UUIDs are the idempotency keys for offline sync:
 * re-sending the same sale is a no-op on the server.
 */

export const kesSchema = z.number().int().nonnegative();

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
  reference: z.string().max(64).nullable(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const saleInputSchema = z
  .object({
    id: z.uuid(),
    receiptNo: z.string().min(1).max(32),
    deviceId: z.uuid(),
    shiftId: z.uuid().nullable(),
    customerId: z.uuid().nullable(),
    priceTier: z.enum(PRICE_TIERS),
    items: z.array(saleItemInputSchema).min(1),
    payments: z.array(paymentInputSchema).min(1),
    /** ISO timestamp from the device clock when the sale was completed. */
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((sale, ctx) => {
    const total = sale.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const paid = sale.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paid !== total) {
      ctx.addIssue({
        code: "custom",
        path: ["payments"],
        message: `Payments (${paid}) must equal the sale total (${total})`,
      });
    }
    if (sale.payments.some((p) => p.method === "CREDIT") && !sale.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "A customer is required for credit sales",
      });
    }
  });
export type SaleInput = z.infer<typeof saleInputSchema>;
