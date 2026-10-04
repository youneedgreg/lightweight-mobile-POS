import { describe, expect, it } from "vitest";

import { canUpload, intakeSchema, ledgerAdjustmentSchema, SYNC_KINDS, syncRequestSchema } from "./operations";
import { saleInputSchema } from "./schemas";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-04T12:00:00.000Z";

describe("sync kinds", () => {
  it("uploads records after the records they depend on", () => {
    const p = (kind: keyof typeof SYNC_KINDS) => SYNC_KINDS[kind].priority;
    expect(p("customer")).toBeLessThan(p("sale"));
    expect(p("shift_open")).toBeLessThan(p("sale"));
    expect(p("intake")).toBeLessThan(p("sale"));
    expect(p("sale")).toBeLessThan(p("shift_close"));
    expect(p("expense")).toBeLessThan(p("shift_close"));
  });

  it("keeps owner-only records off cashier uploads", () => {
    expect(canUpload("intake", "CASHIER")).toBe(false);
    expect(canUpload("ledger_adjustment", "CASHIER")).toBe(false);
    expect(canUpload("supplier_payment", "CASHIER")).toBe(false);
    expect(canUpload("intake", "ADMIN")).toBe(true);
    expect(canUpload("sale", "CASHIER")).toBe(true);
    expect(canUpload("expense", "CASHIER")).toBe(true);
  });

  it("rejects unknown kinds and oversized batches", () => {
    expect(syncRequestSchema.safeParse({ items: [{ kind: "refund", data: {} }] }).success).toBe(false);
    const items = Array.from({ length: 51 }, () => ({ kind: "sale", data: {} }));
    expect(syncRequestSchema.safeParse({ items }).success).toBe(false);
  });
});

describe("operation schemas", () => {
  it("accepts an intake of crates", () => {
    const result = intakeSchema.safeParse({
      id: uuid(1), supplierId: uuid(2), receivedById: "admin", shiftId: null, invoiceRef: "INV-9",
      items: [{ id: uuid(3), productId: uuid(4), productUnitId: uuid(5), quantity: 4, unitCost: 190 }],
      amountPaid: 10000, paymentMethod: "CASH", paymentReference: null, notes: null, occurredAt: now,
    });
    expect(result.success).toBe(true);
  });

  it("requires a reason and a non-zero amount for adjustments", () => {
    const base = { id: uuid(1), party: "customer", partyId: uuid(2), createdById: "admin", occurredAt: now };
    expect(ledgerAdjustmentSchema.safeParse({ ...base, amount: 0, note: "x" }).success).toBe(false);
    expect(ledgerAdjustmentSchema.safeParse({ ...base, amount: -500, note: "" }).success).toBe(false);
    expect(ledgerAdjustmentSchema.safeParse({ ...base, amount: -500, note: "Forgave balance" }).success).toBe(true);
  });
});

describe("sale deposits", () => {
  const sale = {
    id: uuid(10), receiptNo: "D1-000001", deviceId: uuid(11), cashierId: "c", shiftId: null, customerId: null,
    priceTier: "RETAIL",
    items: [{ id: uuid(12), productId: uuid(13), productUnitId: null, quantity: 2, listUnitPrice: 250, unitPrice: 250 }],
    occurredAt: now,
  };

  it("requires payments to cover items plus deposits", () => {
    const empties = [{ productId: uuid(13), returned: 1, depositCharged: 20 }];
    const pay = (amount: number) => [{ id: uuid(14), method: "CASH", amount, reference: null }];
    expect(saleInputSchema.safeParse({ ...sale, empties, payments: pay(500) }).success).toBe(false);
    expect(saleInputSchema.safeParse({ ...sale, empties, payments: pay(520) }).success).toBe(true);
  });

  it("defaults to no empties", () => {
    const parsed = saleInputSchema.parse({ ...sale, payments: [{ id: uuid(14), method: "CASH", amount: 500, reference: null }] });
    expect(parsed.empties).toEqual([]);
  });

  it("rejects empties for products not in the sale", () => {
    const result = saleInputSchema.safeParse({
      ...sale,
      empties: [{ productId: uuid(99), returned: 0, depositCharged: 20 }],
      payments: [{ id: uuid(14), method: "CASH", amount: 520, reference: null }],
    });
    expect(result.success).toBe(false);
  });
});
