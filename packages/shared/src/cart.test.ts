import { describe, expect, it } from "vitest";

import {
  addItem,
  baseQuantities,
  cartTotals,
  changeDue,
  checkPayments,
  depositsDue,
  emptyCart,
  productPrice,
  removeLine,
  returnableLines,
  setPriceTier,
  setQuantity,
  setUnitPrice,
  unitPrice,
  type PricedProduct,
  type PricedUnit,
} from "./cart";

const tusker: PricedProduct = { id: "p-tusker", name: "Tusker", size: "500ml", retailPrice: 250, wholesalePrice: 220 };
const vodka: PricedProduct = { id: "p-vodka", name: "Smirnoff", size: "750ml", retailPrice: 1800, wholesalePrice: null };
const crate: PricedUnit = { id: "u-crate", name: "Crate", unitsPerPack: 25, retailPrice: 5800, wholesalePrice: 5300 };
const carton: PricedUnit = { id: "u-carton", name: "Carton", unitsPerPack: 12, retailPrice: null, wholesalePrice: null };

describe("pricing", () => {
  it("uses the wholesale price only at the wholesale tier", () => {
    expect(productPrice(tusker, "RETAIL")).toBe(250);
    expect(productPrice(tusker, "WHOLESALE")).toBe(220);
  });

  it("falls back to retail when there is no wholesale price", () => {
    expect(productPrice(vodka, "WHOLESALE")).toBe(1800);
  });

  it("uses explicit pack prices", () => {
    expect(unitPrice(tusker, crate, "RETAIL")).toBe(5800);
    expect(unitPrice(tusker, crate, "WHOLESALE")).toBe(5300);
  });

  it("derives pack prices from the bottle price when the pack has none", () => {
    expect(unitPrice(vodka, carton, "RETAIL")).toBe(1800 * 12);
    expect(unitPrice(tusker, carton, "WHOLESALE")).toBe(220 * 12);
  });
});

describe("cart lines", () => {
  it("merges repeated scans of the same item into one line", () => {
    let cart = addItem(emptyCart(), tusker);
    cart = addItem(cart, tusker);
    cart = addItem(cart, tusker, null, 3);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.quantity).toBe(5);
  });

  it("keeps single bottles and packs of the same product on separate lines", () => {
    let cart = addItem(emptyCart(), tusker);
    cart = addItem(cart, tusker, crate);
    expect(cart.lines.map((l) => l.key)).toEqual(["p-tusker", "p-tusker:u-crate"]);
    expect(cart.lines[1]?.name).toBe("Tusker 500ml (Crate)");
    expect(cart.lines[1]?.unitsPerPack).toBe(25);
  });

  it("prices new lines at the cart's tier", () => {
    const cart = addItem(emptyCart("WHOLESALE"), tusker);
    expect(cart.lines[0]?.unitPrice).toBe(220);
  });

  it("removes a line when the quantity drops to zero", () => {
    let cart = addItem(emptyCart(), tusker);
    cart = setQuantity(cart, "p-tusker", 0);
    expect(cart.lines).toHaveLength(0);
  });

  it("rejects fractional quantities", () => {
    const cart = addItem(emptyCart(), tusker);
    expect(() => setQuantity(cart, "p-tusker", 1.5)).toThrow(RangeError);
  });

  it("removes lines explicitly", () => {
    const cart = removeLine(addItem(addItem(emptyCart(), tusker), vodka), "p-tusker");
    expect(cart.lines.map((l) => l.productId)).toEqual(["p-vodka"]);
  });

  it("does not mutate the previous cart", () => {
    const before = addItem(emptyCart(), tusker);
    addItem(before, tusker);
    expect(before.lines[0]?.quantity).toBe(1);
  });
});

describe("discounts and totals", () => {
  it("keeps the list price when the cashier changes the charged price", () => {
    let cart = addItem(emptyCart(), vodka, null, 2);
    cart = setUnitPrice(cart, "p-vodka", 1700);
    expect(cart.lines[0]).toMatchObject({ listUnitPrice: 1800, unitPrice: 1700 });
    expect(cartTotals(cart)).toEqual({ subtotal: 3600, discount: 200, total: 3400, itemCount: 2 });
  });

  it("rejects negative or fractional prices", () => {
    const cart = addItem(emptyCart(), vodka);
    expect(() => setUnitPrice(cart, "p-vodka", -1)).toThrow(RangeError);
    expect(() => setUnitPrice(cart, "p-vodka", 10.5)).toThrow(RangeError);
  });

  it("re-prices every line and drops overrides when the tier changes", () => {
    let cart = addItem(addItem(emptyCart(), tusker, null, 2), tusker, crate);
    cart = setUnitPrice(cart, "p-tusker", 200);
    const lookup = (line: { productUnitId: string | null }) => ({
      product: tusker,
      unit: line.productUnitId ? crate : null,
    });
    cart = setPriceTier(cart, "WHOLESALE", lookup);
    expect(cart.priceTier).toBe("WHOLESALE");
    expect(cart.lines.map((l) => [l.listUnitPrice, l.unitPrice])).toEqual([
      [220, 220],
      [5300, 5300],
    ]);
  });

  it("counts bottles per product across singles and packs", () => {
    let cart = addItem(emptyCart(), tusker, null, 3);
    cart = addItem(cart, tusker, crate, 2);
    cart = addItem(cart, vodka);
    expect(Object.fromEntries(baseQuantities(cart))).toEqual({ "p-tusker": 53, "p-vodka": 1 });
  });
});

describe("payments", () => {
  it("accepts split payments that exactly cover the total", () => {
    const result = checkPayments(
      1000,
      [
        { method: "CASH", amount: 600, reference: null },
        { method: "MPESA", amount: 400, reference: "SJK2ABC123" },
      ],
      false,
    );
    expect(result).toEqual({ paid: 1000, remaining: 0, errors: [] });
  });

  it("reports underpayment and overpayment", () => {
    expect(checkPayments(1000, [{ method: "CASH", amount: 900, reference: null }], false).errors).toContain(
      "KES 100 still to pay.",
    );
    expect(checkPayments(1000, [{ method: "CASH", amount: 1200, reference: null }], false).errors).toContain(
      "Payments are KES 200 more than the total.",
    );
  });

  it("requires a customer for credit", () => {
    const payments = [{ method: "CREDIT" as const, amount: 500, reference: null }];
    expect(checkPayments(500, payments, false).errors).toContain("Pick a customer for credit sales.");
    expect(checkPayments(500, payments, true).errors).toEqual([]);
  });

  it("requires an M-Pesa confirmation code", () => {
    const errors = checkPayments(500, [{ method: "MPESA", amount: 500, reference: "  " }], false).errors;
    expect(errors).toContain("Enter the M-Pesa confirmation code.");
  });

  it("rejects an empty cart", () => {
    expect(checkPayments(0, [], false).errors).toContain("The cart is empty.");
  });

  it("computes change and never returns negative change", () => {
    expect(changeDue(1000, 850)).toBe(150);
    expect(changeDue(500, 850)).toBe(0);
  });
});

describe("empties and deposits", () => {
  const returnableTusker = { ...tusker, depositAmount: 20 };

  it("counts returnable bottles across singles and crates", () => {
    let cart = addItem(emptyCart(), returnableTusker, null, 3);
    cart = addItem(cart, returnableTusker, crate);
    cart = addItem(cart, vodka);
    expect(returnableLines(cart)).toEqual([
      { productId: "p-tusker", name: "Tusker 500ml", bottles: 28, depositPerBottle: 20 },
    ]);
  });

  it("charges a deposit for every bottle not exchanged", () => {
    const lines = returnableLines(addItem(emptyCart(), returnableTusker, crate));
    expect(depositsDue(lines, new Map([["p-tusker", 20]]))).toEqual([
      { productId: "p-tusker", returned: 20, depositCharged: 5 * 20 },
    ]);
    expect(depositsDue(lines, new Map())).toEqual([{ productId: "p-tusker", returned: 0, depositCharged: 25 * 20 }]);
  });

  it("clamps returned empties to the bottles sold", () => {
    const lines = returnableLines(addItem(emptyCart(), returnableTusker, null, 2));
    expect(depositsDue(lines, new Map([["p-tusker", 9]]))[0]).toMatchObject({ returned: 2, depositCharged: 0 });
    expect(depositsDue(lines, new Map([["p-tusker", -3]]))[0]).toMatchObject({ returned: 0, depositCharged: 40 });
  });
});
