/**
 * All money in the system is an integer number of Kenyan shillings (no cents).
 * Never store or compute money as floating point.
 */
export type Kes = number;

export function assertKes(value: number): Kes {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be a whole number of shillings, got ${value}`);
  }
  return value;
}

const formatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

/** 1500 -> "Ksh 1,500" */
export function formatKes(amount: Kes): string {
  return formatter.format(amount);
}

export function sumKes(amounts: readonly Kes[]): Kes {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Total for `quantity` units at `unitPrice`. */
export function lineTotal(unitPrice: Kes, quantity: number): Kes {
  return assertKes(unitPrice * quantity);
}
