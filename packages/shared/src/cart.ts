import type { PaymentMethod, PriceTier } from "./enums";
import type { Kes } from "./money";

/**
 * Pure cart logic used by the POS app. No I/O, so it is unit-tested here and
 * the app only wires it to React state.
 */

/** The pricing facts the cart needs about a product. */
export interface PricedProduct {
  id: string;
  name: string;
  size: string | null;
  retailPrice: Kes;
  wholesalePrice: Kes | null;
  /** Deposit per returnable bottle; 0 or absent when the bottle isn't returnable. */
  depositAmount?: Kes;
}

/** A pack of a product (e.g. "Crate of 24"). */
export interface PricedUnit {
  id: string;
  name: string;
  unitsPerPack: number;
  retailPrice: Kes | null;
  wholesalePrice: Kes | null;
}

export interface CartLine {
  /** productId, or productId:unitId for packs. One line per sellable thing. */
  key: string;
  productId: string;
  productUnitId: string | null;
  name: string;
  quantity: number;
  /** Bottles per sold unit: 1 for single items, unitsPerPack for packs. */
  unitsPerPack: number;
  listUnitPrice: Kes;
  unitPrice: Kes;
  /** Deposit per bottle when the bottle is returnable, else 0. */
  depositPerBottle: Kes;
}

export interface Cart {
  priceTier: PriceTier;
  customerId: string | null;
  lines: CartLine[];
}

export const emptyCart = (priceTier: PriceTier = "RETAIL"): Cart => ({
  priceTier,
  customerId: null,
  lines: [],
});

/** Price of one bottle at a tier. Wholesale falls back to retail when not set. */
export function productPrice(product: PricedProduct, tier: PriceTier): Kes {
  return tier === "WHOLESALE" ? (product.wholesalePrice ?? product.retailPrice) : product.retailPrice;
}

/** Price of one pack at a tier. Falls back to unitsPerPack × the bottle price at that tier. */
export function unitPrice(product: PricedProduct, unit: PricedUnit, tier: PriceTier): Kes {
  const explicit =
    tier === "WHOLESALE" ? (unit.wholesalePrice ?? unit.retailPrice) : unit.retailPrice;
  return explicit ?? productPrice(product, tier) * unit.unitsPerPack;
}

function lineName(product: PricedProduct, unit: PricedUnit | null): string {
  const base = product.size ? `${product.name} ${product.size}` : product.name;
  return unit ? `${base} (${unit.name})` : base;
}

/** Adds one of a product (or pack), merging with an existing line. */
export function addItem(
  cart: Cart,
  product: PricedProduct,
  unit: PricedUnit | null = null,
  quantity = 1,
): Cart {
  const key = unit ? `${product.id}:${unit.id}` : product.id;
  const existing = cart.lines.find((line) => line.key === key);
  if (existing) {
    return setQuantity(cart, key, existing.quantity + quantity);
  }
  const price = unit ? unitPrice(product, unit, cart.priceTier) : productPrice(product, cart.priceTier);
  const line: CartLine = {
    key,
    productId: product.id,
    productUnitId: unit?.id ?? null,
    name: lineName(product, unit),
    quantity,
    unitsPerPack: unit?.unitsPerPack ?? 1,
    listUnitPrice: price,
    unitPrice: price,
    depositPerBottle: product.depositAmount ?? 0,
  };
  return { ...cart, lines: [...cart.lines, line] };
}

/** Sets a line's quantity; zero or less removes it. */
export function setQuantity(cart: Cart, key: string, quantity: number): Cart {
  if (!Number.isInteger(quantity)) throw new RangeError("Quantity must be a whole number");
  if (quantity <= 0) return removeLine(cart, key);
  return {
    ...cart,
    lines: cart.lines.map((line) => (line.key === key ? { ...line, quantity } : line)),
  };
}

/** Overrides the charged price for a line (cashier discount). The list price is kept for audit. */
export function setUnitPrice(cart: Cart, key: string, price: Kes): Cart {
  if (!Number.isSafeInteger(price) || price < 0) {
    throw new RangeError("Price must be a whole, non-negative number of shillings");
  }
  return {
    ...cart,
    lines: cart.lines.map((line) => (line.key === key ? { ...line, unitPrice: price } : line)),
  };
}

export function removeLine(cart: Cart, key: string): Cart {
  return { ...cart, lines: cart.lines.filter((line) => line.key !== key) };
}

/**
 * Switches price tier and re-prices every line from the price list.
 * Manual price overrides are dropped, because they were relative to the old tier.
 */
export function setPriceTier(
  cart: Cart,
  tier: PriceTier,
  lookup: (line: CartLine) => { product: PricedProduct; unit: PricedUnit | null } | null,
): Cart {
  return {
    ...cart,
    priceTier: tier,
    lines: cart.lines.map((line) => {
      const found = lookup(line);
      if (!found) return line;
      const price = found.unit
        ? unitPrice(found.product, found.unit, tier)
        : productPrice(found.product, tier);
      return { ...line, listUnitPrice: price, unitPrice: price };
    }),
  };
}

export interface CartTotals {
  /** Sum of list prices. */
  subtotal: Kes;
  /** subtotal − total; negative if prices were raised. */
  discount: Kes;
  total: Kes;
  /** Number of sold units (bottles or packs). */
  itemCount: number;
}

export function cartTotals(cart: Cart): CartTotals {
  let subtotal = 0;
  let total = 0;
  let itemCount = 0;
  for (const line of cart.lines) {
    subtotal += line.listUnitPrice * line.quantity;
    total += line.unitPrice * line.quantity;
    itemCount += line.quantity;
  }
  return { subtotal, discount: subtotal - total, total, itemCount };
}

/** Bottles leaving stock per product, for decrementing local stock. */
export function baseQuantities(cart: Cart): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of cart.lines) {
    result.set(line.productId, (result.get(line.productId) ?? 0) + line.quantity * line.unitsPerPack);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Empties and deposits
// ---------------------------------------------------------------------------

export interface ReturnableLine {
  productId: string;
  name: string;
  /** Bottles leaving the shop, across single bottles and packs. */
  bottles: number;
  depositPerBottle: Kes;
}

/** Returnable products in the cart, one entry per product. */
export function returnableLines(cart: Cart): ReturnableLine[] {
  const byProduct = new Map<string, ReturnableLine>();
  for (const line of cart.lines) {
    if (line.depositPerBottle <= 0) continue;
    const bottles = line.quantity * line.unitsPerPack;
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.bottles += bottles;
    } else {
      // Use the product name without a pack suffix.
      byProduct.set(line.productId, {
        productId: line.productId,
        name: line.name.replace(/ \([^)]*\)$/, ""),
        bottles,
        depositPerBottle: line.depositPerBottle,
      });
    }
  }
  return [...byProduct.values()];
}

export interface EmptiesDue {
  productId: string;
  returned: number;
  depositCharged: Kes;
}

/**
 * Deposit owed per returnable product: every bottle not exchanged for an
 * empty pays the deposit. Returned counts are clamped to 0..bottles.
 */
export function depositsDue(lines: readonly ReturnableLine[], returned: ReadonlyMap<string, number>): EmptiesDue[] {
  return lines.map((line) => {
    const given = Math.min(line.bottles, Math.max(0, Math.trunc(returned.get(line.productId) ?? 0)));
    return { productId: line.productId, returned: given, depositCharged: (line.bottles - given) * line.depositPerBottle };
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface DraftPayment {
  method: PaymentMethod;
  amount: Kes;
  reference: string | null;
}

export interface PaymentCheck {
  paid: Kes;
  remaining: Kes;
  /** Problems that block completing the sale. Empty when the sale can be completed. */
  errors: string[];
}

/** Validates split payments against the sale total. Payments must cover the total exactly. */
export function checkPayments(total: Kes, payments: readonly DraftPayment[], hasCustomer: boolean): PaymentCheck {
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const errors: string[] = [];
  if (payments.some((p) => !Number.isSafeInteger(p.amount) || p.amount <= 0)) {
    errors.push("Every payment must be a positive whole amount.");
  }
  if (paid < total) errors.push(`KES ${total - paid} still to pay.`);
  if (paid > total) errors.push(`Payments are KES ${paid - total} more than the total.`);
  if (payments.some((p) => p.method === "CREDIT") && !hasCustomer) {
    errors.push("Pick a customer for credit sales.");
  }
  if (payments.some((p) => p.method === "MPESA" && !p.reference?.trim())) {
    errors.push("Enter the M-Pesa confirmation code.");
  }
  if (total <= 0) errors.push("The cart is empty.");
  return { paid, remaining: total - paid, errors };
}

/** Change to give back when the customer hands over `tendered` cash for `due`. */
export function changeDue(tendered: Kes, due: Kes): Kes {
  return Math.max(0, tendered - due);
}
