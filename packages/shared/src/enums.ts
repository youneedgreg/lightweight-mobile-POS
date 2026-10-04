/**
 * Domain enums shared by the web API, the Postgres schema and the mobile app.
 * The Drizzle pgEnums are built from these arrays, so this file is the single
 * source of truth — adding a value here requires a DB migration.
 */

export const USER_ROLES = ["ADMIN", "CASHIER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PAYMENT_METHODS = ["CASH", "MPESA", "CREDIT"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** PENDING/FAILED exist for M-Pesa STK pushes (Phase 7); manual payments are COMPLETED immediately. */
export const PAYMENT_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRICE_TIERS = ["RETAIL", "WHOLESALE"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const SALE_STATUSES = ["COMPLETED", "VOIDED"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SHIFT_STATUSES = ["OPEN", "CLOSED"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const CUSTOMER_TYPES = ["CUSTOMER", "PROMOTER"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/**
 * Every change to stock is one signed row in stock_movements, always counted
 * in base units (bottles). Stock on hand = SUM(quantity).
 */
export const STOCK_MOVEMENT_TYPES = [
  "SALE", // negative
  "SALE_VOID", // positive, reverses a SALE
  "INTAKE", // positive, stock received from a supplier
  "CASE_BREAK_OUT", // negative on a case product, when cases are stocked as their own product
  "CASE_BREAK_IN", // positive on the bottle product
  "ADJUSTMENT", // either sign: recount, breakage, theft
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** "Money owed to us". Positive amount = the customer owes more. */
export const CUSTOMER_LEDGER_TYPES = ["CREDIT_SALE", "PAYMENT", "SALE_VOID", "ADJUSTMENT"] as const;
export type CustomerLedgerType = (typeof CUSTOMER_LEDGER_TYPES)[number];

/** "Money we owe". Positive amount = we owe the supplier more. */
export const SUPPLIER_LEDGER_TYPES = ["PURCHASE", "PAYMENT", "ADJUSTMENT"] as const;
export type SupplierLedgerType = (typeof SUPPLIER_LEDGER_TYPES)[number];

/**
 * Returnable bottles/crates. On a ledger row, `quantity` > 0 means empties came
 * into the shop and `deposit` > 0 means deposit money came into the shop.
 */
export const EMPTIES_LEDGER_TYPES = [
  "DEPOSIT_COLLECTED", // customer took full bottles and paid a deposit
  "RETURNED_BY_CUSTOMER", // customer brought empties back, deposit refunded
  "RETURNED_TO_SUPPLIER", // we sent empties back to the supplier
  "RECEIVED_FROM_SUPPLIER", // supplier delivered full crates against our empties
  "ADJUSTMENT",
] as const;
export type EmptiesLedgerType = (typeof EMPTIES_LEDGER_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  "CASUAL_LABOUR",
  "TRANSPORT",
  "RENT",
  "UTILITIES",
  "SUPPLIES",
  "LICENSES",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
