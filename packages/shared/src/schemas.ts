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
  reference: z.string().trim().max(64).nullable(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

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

/** A customer created on a phone (possibly offline), uploaded before the sales that reference it. */
export const customerInputSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).nullable(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const SYNC_MAX_SALES = 50;
export const SYNC_MAX_CUSTOMERS = 100;

export const syncRequestSchema = z.object({
  customers: z.array(customerInputSchema).max(SYNC_MAX_CUSTOMERS),
  sales: z.array(z.unknown()).max(SYNC_MAX_SALES),
});
export type SyncRequest = { customers: CustomerInput[]; sales: SaleInput[] };

/**
 * created   – stored for the first time
 * duplicate – already stored by an earlier upload (safe to drop from the queue)
 * rejected  – can never be stored as sent; keep it and show it for attention
 */
export const SYNC_ITEM_STATUSES = ["created", "duplicate", "rejected"] as const;
export type SyncItemStatus = (typeof SYNC_ITEM_STATUSES)[number];

export const syncItemResultSchema = z.object({
  id: z.string(),
  status: z.enum(SYNC_ITEM_STATUSES),
  message: z.string().nullable(),
});
export type SyncItemResult = z.infer<typeof syncItemResultSchema>;

export const syncResponseSchema = z.object({
  customers: z.array(syncItemResultSchema),
  sales: z.array(syncItemResultSchema),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;
