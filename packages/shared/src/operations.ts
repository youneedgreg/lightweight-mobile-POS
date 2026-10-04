import { z } from "zod";

import { EXPENSE_CATEGORIES, type UserRole } from "./enums";
import { customerInputSchema, isoTimestampSchema, kesSchema, saleInputSchema } from "./schemas";

/**
 * Everything a phone records offline, uploaded through one sync endpoint.
 * Each record has a client-generated UUID, so re-uploading is harmless.
 */

/** Money that moves outside a sale can only be cash or M-Pesa (credit is not money). */
export const MONEY_METHODS = ["CASH", "MPESA"] as const;
export type MoneyMethod = (typeof MONEY_METHODS)[number];

const reference = z.string().trim().max(64).nullable();
const note = z.string().trim().max(500).nullable();

export const shiftOpenSchema = z.object({
  id: z.uuid(),
  deviceId: z.uuid(),
  cashierId: z.string().min(1),
  openingFloat: kesSchema,
  openedAt: isoTimestampSchema,
});
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>;

export const shiftCloseSchema = z.object({
  /** The shift being closed. */
  id: z.uuid(),
  closedById: z.string().min(1),
  countedCash: kesSchema,
  closedAt: isoTimestampSchema,
  notes: note,
});
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>;

export const intakeItemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  /** Set when received as packs (crates/cartons): each pack is broken into unitsPerPack bottles. */
  productUnitId: z.uuid().nullable(),
  quantity: z.number().int().positive(),
  /** Cost per bottle. */
  unitCost: kesSchema,
});
export type IntakeItemInput = z.infer<typeof intakeItemSchema>;

export const intakeSchema = z.object({
  id: z.uuid(),
  supplierId: z.uuid().nullable(),
  receivedById: z.string().min(1),
  shiftId: z.uuid().nullable(),
  invoiceRef: z.string().trim().max(64).nullable(),
  items: z.array(intakeItemSchema).min(1).max(300),
  /** Paid to the supplier on delivery; the rest is owed to them. */
  amountPaid: kesSchema,
  paymentMethod: z.enum(MONEY_METHODS).nullable(),
  paymentReference: reference,
  notes: note,
  occurredAt: isoTimestampSchema,
});
export type IntakeInput = z.infer<typeof intakeSchema>;

/** A customer paying down what they owe. */
export const customerPaymentSchema = z.object({
  id: z.uuid(),
  customerId: z.uuid(),
  receivedById: z.string().min(1),
  shiftId: z.uuid().nullable(),
  method: z.enum(MONEY_METHODS),
  amount: kesSchema.positive(),
  reference,
  occurredAt: isoTimestampSchema,
});
export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;

/** The shop paying a supplier. */
export const supplierPaymentSchema = z.object({
  id: z.uuid(),
  supplierId: z.uuid(),
  paidById: z.string().min(1),
  shiftId: z.uuid().nullable(),
  method: z.enum(MONEY_METHODS),
  amount: kesSchema.positive(),
  reference,
  note,
  occurredAt: isoTimestampSchema,
});
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

export const expenseSchema = z.object({
  id: z.uuid(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(1).max(200),
  amount: kesSchema.positive(),
  method: z.enum(MONEY_METHODS),
  shiftId: z.uuid().nullable(),
  createdById: z.string().min(1),
  occurredAt: isoTimestampSchema,
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

/** Empty bottles brought back after the sale; the deposit is refunded in cash. */
export const emptiesReturnSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  depositRefunded: kesSchema,
  customerId: z.uuid().nullable(),
  shiftId: z.uuid().nullable(),
  createdById: z.string().min(1),
  occurredAt: isoTimestampSchema,
});
export type EmptiesReturnInput = z.infer<typeof emptiesReturnSchema>;

/** Owner-only manual correction of a balance. Positive = they owe more / we owe more. */
export const ledgerAdjustmentSchema = z.object({
  id: z.uuid(),
  party: z.enum(["customer", "supplier"]),
  partyId: z.uuid(),
  amount: z.number().int().refine((n) => n !== 0, "Adjustment can't be zero"),
  note: z.string().trim().min(1, "Give a reason").max(500),
  createdById: z.string().min(1),
  occurredAt: isoTimestampSchema,
});
export type LedgerAdjustmentInput = z.infer<typeof ledgerAdjustmentSchema>;

/**
 * Upload order. Lower numbers go first, so a record is always uploaded after
 * the records it refers to (a sale after its shift and customer, a shift close
 * after the shift's sales).
 */
export const SYNC_KINDS = {
  customer: { priority: 0, schema: customerInputSchema, adminOnly: false },
  shift_open: { priority: 1, schema: shiftOpenSchema, adminOnly: false },
  intake: { priority: 2, schema: intakeSchema, adminOnly: true },
  sale: { priority: 3, schema: saleInputSchema, adminOnly: false },
  customer_payment: { priority: 4, schema: customerPaymentSchema, adminOnly: false },
  supplier_payment: { priority: 4, schema: supplierPaymentSchema, adminOnly: true },
  expense: { priority: 4, schema: expenseSchema, adminOnly: false },
  empties_return: { priority: 4, schema: emptiesReturnSchema, adminOnly: false },
  ledger_adjustment: { priority: 4, schema: ledgerAdjustmentSchema, adminOnly: true },
  shift_close: { priority: 5, schema: shiftCloseSchema, adminOnly: false },
} as const;

export type SyncKind = keyof typeof SYNC_KINDS;
export const SYNC_KIND_NAMES = Object.keys(SYNC_KINDS) as SyncKind[];

/** Payload type for each kind, as sent by the phone. */
export type SyncPayload<K extends SyncKind> = z.input<(typeof SYNC_KINDS)[K]["schema"]>;

/** Admin-only kinds are uploaded only while an owner is signed in on the phone. */
export function canUpload(kind: SyncKind, role: UserRole): boolean {
  return !SYNC_KINDS[kind].adminOnly || role === "ADMIN";
}

export const SYNC_MAX_ITEMS = 50;

export const syncRequestSchema = z.object({
  /** Payloads are validated per item on the server so one bad record can't fail the batch. */
  items: z
    .array(z.object({ kind: z.enum(SYNC_KIND_NAMES as [SyncKind, ...SyncKind[]]), data: z.unknown() }))
    .max(SYNC_MAX_ITEMS),
});
export type SyncRequestItem = { [K in SyncKind]: { kind: K; data: SyncPayload<K> } }[SyncKind];
export type SyncRequest = { items: SyncRequestItem[] };

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
  /** One result per request item, in the same order. */
  results: z.array(syncItemResultSchema),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;
