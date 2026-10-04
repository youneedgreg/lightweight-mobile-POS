import { describe, expect, it } from "vitest";

import { normalizeKenyanPhone } from "./auth";
import { formatKes, lineTotal } from "./money";
import { saleInputSchema, type SaleInput } from "./schemas";

const sale = (overrides: Partial<SaleInput> = {}): SaleInput => ({
  id: "0b8f3c9a-2f43-4d55-9a3c-6f1d2a7e4b10",
  receiptNo: "D1-000001",
  deviceId: "5a0c1f7e-8d2b-4e3a-9f61-2c7d8e9a0b1c",
  cashierId: "user-1",
  shiftId: null,
  customerId: null,
  priceTier: "RETAIL",
  items: [
    {
      id: "7c6b5a49-3e2d-4c1b-8a09-f8e7d6c5b4a3",
      productId: "1e2d3c4b-5a69-4788-9a6b-5c4d3e2f1a0b",
      productUnitId: null,
      quantity: 2,
      listUnitPrice: 250,
      unitPrice: 250,
    },
  ],
  payments: [{ id: "2f3e4d5c-6b7a-4899-8a7b-6c5d4e3f2a1b", method: "CASH", amount: 500, reference: null }],
  occurredAt: "2026-10-04T10:15:00.000Z",
  ...overrides,
});

describe("saleInputSchema", () => {
  it("accepts a valid cash sale", () => {
    expect(saleInputSchema.safeParse(sale()).success).toBe(true);
  });

  it("rejects payments that don't match the total", () => {
    const result = saleInputSchema.safeParse(
      sale({ payments: [{ id: "2f3e4d5c-6b7a-4899-8a7b-6c5d4e3f2a1b", method: "CASH", amount: 400, reference: null }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects credit sales without a customer", () => {
    const result = saleInputSchema.safeParse(
      sale({ payments: [{ id: "2f3e4d5c-6b7a-4899-8a7b-6c5d4e3f2a1b", method: "CREDIT", amount: 500, reference: null }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects fractional money", () => {
    const result = saleInputSchema.safeParse(
      sale({
        items: [{ ...sale().items[0]!, unitPrice: 249.5, listUnitPrice: 249.5 }],
        payments: [{ id: "2f3e4d5c-6b7a-4899-8a7b-6c5d4e3f2a1b", method: "CASH", amount: 499, reference: null }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an empty sale", () => {
    expect(saleInputSchema.safeParse(sale({ items: [] })).success).toBe(false);
  });
});

describe("normalizeKenyanPhone", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["0712 345 678", "+254712345678"],
    ["712345678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["+254 712-345-678", "+254712345678"],
    ["0110123456", "+254110123456"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0812345678", "+255712345678", "07123456789"])("rejects %s", (input) => {
    expect(normalizeKenyanPhone(input)).toBeNull();
  });
});

describe("money", () => {
  it("formats whole shillings", () => {
    expect(formatKes(1500).replace(/\s/g, " ")).toMatch(/1,500/);
  });

  it("refuses non-integer line totals", () => {
    expect(() => lineTotal(10.5, 2)).not.toThrow();
    expect(() => lineTotal(10.25, 1)).toThrow(RangeError);
  });
});
