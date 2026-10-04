/**
 * Postgres schema (Neon) for the liquor store POS.
 *
 * Conventions
 * - Money columns are `integer` whole Kenyan shillings (see @liquor-pos/shared/money).
 * - Quantities in stock_movements are always base units (bottles).
 * - Rows created on phones (sales, payments, shifts, expenses, intakes…) use
 *   client-generated UUIDs as primary keys so offline sync is idempotent:
 *   the server inserts with ON CONFLICT DO NOTHING.
 * - `occurredAt` is when it happened on the device; `createdAt` is when the
 *   server received it. Reports use occurredAt.
 * - Ledgers are append-only. Balances are SUM(amount); corrections are new rows.
 */
import {
  CUSTOMER_LEDGER_TYPES,
  CUSTOMER_TYPES,
  EMPTIES_LEDGER_TYPES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRICE_TIERS,
  SALE_STATUSES,
  SHIFT_STATUSES,
  STOCK_MOVEMENT_TYPES,
  SUPPLIER_LEDGER_TYPES,
  USER_ROLES,
} from "@liquor-pos/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", USER_ROLES);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const paymentStatus = pgEnum("payment_status", PAYMENT_STATUSES);
export const priceTier = pgEnum("price_tier", PRICE_TIERS);
export const saleStatus = pgEnum("sale_status", SALE_STATUSES);
export const shiftStatus = pgEnum("shift_status", SHIFT_STATUSES);
export const customerType = pgEnum("customer_type", CUSTOMER_TYPES);
export const stockMovementType = pgEnum("stock_movement_type", STOCK_MOVEMENT_TYPES);
export const customerLedgerType = pgEnum("customer_ledger_type", CUSTOMER_LEDGER_TYPES);
export const supplierLedgerType = pgEnum("supplier_ledger_type", SUPPLIER_LEDGER_TYPES);
export const emptiesLedgerType = pgEnum("empties_ledger_type", EMPTIES_LEDGER_TYPES);
export const expenseCategory = pgEnum("expense_category", EXPENSE_CATEGORIES);

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const occurredAt = () =>
  timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

/** Whole shillings. */
const kes = (name: string) => integer(name);

// ---------------------------------------------------------------------------
// Auth.js tables (column names follow @auth/drizzle-adapter's expectations)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified", { withTimezone: true, mode: "date" }),
    image: text("image"),
    /** E.164 format, e.g. +254712345678. Used for cashier PIN login. */
    phone: text("phone").unique(),
    role: userRole("role").notNull().default("CASHIER"),
    /** Full password, used by admins on the web dashboard. */
    passwordHash: text("password_hash"),
    /** 4–6 digit PIN, used by cashiers on mobile. */
    pinHash: text("pin_hash"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("user_has_login", sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`),
  ],
);

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Devices (each cashier phone)
// ---------------------------------------------------------------------------

export const devices = pgTable("device", {
  /** Generated on the phone at first launch and kept in secure storage. */
  id: uuid("id").primaryKey(),
  label: text("label").notNull(),
  /** Short code used to prefix receipt numbers, e.g. "A" -> A-000123. */
  receiptPrefix: text("receipt_prefix").notNull().unique(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
  lastUserId: text("last_user_id").references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const categories = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A sellable item, stocked in base units (usually one bottle or can). */
export const products = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** e.g. "750ml", "500ml can". */
    size: text("size"),
    sku: text("sku").unique(),
    /** Barcode on the single bottle. Packs have their own in product_unit. */
    barcode: text("barcode").unique(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    retailPrice: kes("retail_price").notNull(),
    /** Falls back to retailPrice when null. */
    wholesalePrice: kes("wholesale_price"),
    /** Latest cost per base unit, refreshed on every intake. Snapshotted onto sale items. */
    costPrice: kes("cost_price").notNull().default(0),
    /** Cached SUM(stock_movement.quantity). Updated in the same transaction as each movement. May go negative. */
    stockOnHand: integer("stock_on_hand").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(0),
    /** Returnable bottle: selling it collects a deposit and creates an empties obligation. */
    isReturnable: boolean("is_returnable").notNull().default(false),
    depositAmount: kes("deposit_amount").notNull().default(0),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("product_category_idx").on(t.categoryId),
    index("product_updated_at_idx").on(t.updatedAt),
    check("product_prices_non_negative", sql`${t.retailPrice} >= 0 AND ${t.costPrice} >= 0`),
  ],
);

/**
 * Packaging units for a product, e.g. "Crate of 24" or "Carton of 12".
 * Scanning a pack barcode either sells the whole pack or, at intake, adds
 * `unitsPerPack` base units to stock ("break into bottles").
 */
export const productUnits = pgTable(
  "product_unit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    barcode: text("barcode").unique(),
    unitsPerPack: integer("units_per_pack").notNull(),
    /** Price for the whole pack. Null = unitsPerPack × the bottle price. */
    retailPrice: kes("retail_price"),
    wholesalePrice: kes("wholesale_price"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("product_unit_product_idx").on(t.productId),
    check("product_unit_units_positive", sql`${t.unitsPerPack} > 1`),
  ],
);

// ---------------------------------------------------------------------------
// People we trade with
// ---------------------------------------------------------------------------

export const customers = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    type: customerType("type").notNull().default("CUSTOMER"),
    priceTier: priceTier("price_tier").notNull().default("RETAIL"),
    /** Null = no limit. */
    creditLimit: kes("credit_limit"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customer_name_idx").on(t.name), index("customer_updated_at_idx").on(t.updatedAt)],
);

export const suppliers = pgTable("supplier", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Shifts / till
// ---------------------------------------------------------------------------

export const shifts = pgTable(
  "shift",
  {
    id: uuid("id").primaryKey(),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    status: shiftStatus("status").notNull().default("OPEN"),
    openingFloat: kes("opening_float").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    /** Float + cash sales + cash debt repayments − cash expenses − deposit refunds. Computed on close. */
    expectedCash: kes("expected_cash"),
    countedCash: kes("counted_cash"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shift_cashier_idx").on(t.cashierId), index("shift_opened_at_idx").on(t.openedAt)],
);

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const sales = pgTable(
  "sale",
  {
    /** Client-generated; the idempotency key for sync. */
    id: uuid("id").primaryKey(),
    receiptNo: text("receipt_no").notNull().unique(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    customerId: uuid("customer_id").references(() => customers.id),
    priceTier: priceTier("price_tier").notNull().default("RETAIL"),
    status: saleStatus("status").notNull().default("COMPLETED"),
    /** Sum of list prices. */
    subtotal: kes("subtotal").notNull(),
    /** subtotal − total. Non-zero means the cashier changed prices. */
    discountTotal: kes("discount_total").notNull().default(0),
    total: kes("total").notNull(),
    /** Sum of item cost snapshots, for profit reports. */
    costTotal: kes("cost_total").notNull().default(0),
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
    voidedById: text("voided_by_id").references(() => users.id),
    voidReason: text("void_reason"),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sale_occurred_at_idx").on(t.occurredAt),
    index("sale_shift_idx").on(t.shiftId),
    index("sale_customer_idx").on(t.customerId),
    check("sale_total_consistent", sql`${t.total} = ${t.subtotal} - ${t.discountTotal}`),
  ],
);

export const saleItems = pgTable(
  "sale_item",
  {
    id: uuid("id").primaryKey(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Set when a whole pack was sold. */
    productUnitId: uuid("product_unit_id").references(() => productUnits.id),
    /** Sold units (bottles, or packs if productUnitId is set). */
    quantity: integer("quantity").notNull(),
    /** quantity × unitsPerPack. What leaves stock. */
    baseQuantity: integer("base_quantity").notNull(),
    listUnitPrice: kes("list_unit_price").notNull(),
    unitPrice: kes("unit_price").notNull(),
    lineTotal: kes("line_total").notNull(),
    /** Cost per base unit at time of sale. */
    unitCost: kes("unit_cost").notNull().default(0),
  },
  (t) => [
    index("sale_item_sale_idx").on(t.saleId),
    index("sale_item_product_idx").on(t.productId),
    check("sale_item_quantity_positive", sql`${t.quantity} > 0 AND ${t.baseQuantity} > 0`),
  ],
);

/**
 * Money received. A sale can have several (split payment). A payment without
 * a sale is a customer paying down their debt.
 */
export const payments = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey(),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    receivedById: text("received_by_id")
      .notNull()
      .references(() => users.id),
    method: paymentMethod("method").notNull(),
    status: paymentStatus("status").notNull().default("COMPLETED"),
    amount: kes("amount").notNull(),
    /** M-Pesa receipt code etc. */
    reference: text("reference"),
    /** M-Pesa CheckoutRequestID for STK push correlation (Phase 7). */
    externalId: text("external_id").unique(),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_sale_idx").on(t.saleId),
    index("payment_shift_idx").on(t.shiftId),
    index("payment_occurred_at_idx").on(t.occurredAt),
    check("payment_amount_positive", sql`${t.amount} > 0`),
    check(
      "payment_has_target",
      sql`${t.saleId} IS NOT NULL OR ${t.customerId} IS NOT NULL`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export const stockIntakes = pgTable(
  "stock_intake",
  {
    id: uuid("id").primaryKey(),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    receivedById: text("received_by_id")
      .notNull()
      .references(() => users.id),
    invoiceRef: text("invoice_ref"),
    totalCost: kes("total_cost").notNull(),
    /** Paid on delivery. totalCost − amountPaid goes to the supplier ledger. */
    amountPaid: kes("amount_paid").notNull().default(0),
    notes: text("notes"),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [index("stock_intake_occurred_at_idx").on(t.occurredAt)],
);

export const stockIntakeItems = pgTable(
  "stock_intake_item",
  {
    id: uuid("id").primaryKey(),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => stockIntakes.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Set when received as packs (e.g. 5 crates). */
    productUnitId: uuid("product_unit_id").references(() => productUnits.id),
    quantity: integer("quantity").notNull(),
    baseQuantity: integer("base_quantity").notNull(),
    /** Cost per base unit (bottle). */
    unitCost: kes("unit_cost").notNull(),
    lineTotal: kes("line_total").notNull(),
  },
  (t) => [index("stock_intake_item_intake_idx").on(t.intakeId)],
);

/** Append-only stock ledger. Source of truth for stock_on_hand. */
export const stockMovements = pgTable(
  "stock_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    type: stockMovementType("type").notNull(),
    /** Signed, in base units. */
    quantity: integer("quantity").notNull(),
    saleId: uuid("sale_id").references(() => sales.id),
    intakeId: uuid("intake_id").references(() => stockIntakes.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    deviceId: uuid("device_id").references(() => devices.id),
    reason: text("reason"),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movement_product_idx").on(t.productId, t.occurredAt),
    index("stock_movement_sale_idx").on(t.saleId),
    check("stock_movement_non_zero", sql`${t.quantity} <> 0`),
  ],
);

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------

/** Money owed to us. Balance = SUM(amount) per customer. */
export const customerLedger = pgTable(
  "customer_ledger_entry",
  {
    id: uuid("id").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    type: customerLedgerType("type").notNull(),
    /** Positive = customer owes more; negative = customer paid / we forgave. */
    amount: kes("amount").notNull(),
    saleId: uuid("sale_id").references(() => sales.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    note: text("note"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [index("customer_ledger_customer_idx").on(t.customerId, t.occurredAt)],
);

/** Money we owe. Balance = SUM(amount) per supplier. */
export const supplierLedger = pgTable(
  "supplier_ledger_entry",
  {
    id: uuid("id").primaryKey(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    type: supplierLedgerType("type").notNull(),
    /** Positive = we owe more; negative = we paid. */
    amount: kes("amount").notNull(),
    intakeId: uuid("intake_id").references(() => stockIntakes.id),
    method: paymentMethod("method"),
    reference: text("reference"),
    note: text("note"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [index("supplier_ledger_supplier_idx").on(t.supplierId, t.occurredAt)],
);

/** Returnable bottles/crates and the deposits attached to them. */
export const emptiesLedger = pgTable(
  "empties_ledger_entry",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    type: emptiesLedgerType("type").notNull(),
    /** Signed empties count: positive = empties came into the shop. */
    quantity: integer("quantity").notNull(),
    /** Signed deposit money: positive = deposit came into the shop. */
    deposit: kes("deposit").notNull().default(0),
    customerId: uuid("customer_id").references(() => customers.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    saleId: uuid("sale_id").references(() => sales.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    note: text("note"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [index("empties_ledger_product_idx").on(t.productId, t.occurredAt)],
);

export const expenses = pgTable(
  "expense",
  {
    id: uuid("id").primaryKey(),
    category: expenseCategory("category").notNull(),
    description: text("description").notNull(),
    amount: kes("amount").notNull(),
    method: paymentMethod("method").notNull().default("CASH"),
    /** Cash expenses paid from the till reduce the shift's expected cash. */
    shiftId: uuid("shift_id").references(() => shifts.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    occurredAt: occurredAt(),
    createdAt: createdAt(),
  },
  (t) => [
    index("expense_occurred_at_idx").on(t.occurredAt),
    check("expense_amount_positive", sql`${t.amount} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Sensitive actions: price overrides, voids, manual stock/ledger adjustments, role changes. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations (for db.query.* relational reads)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  sales: many(sales),
  shifts: many(shifts),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  units: many(productUnits),
  movements: many(stockMovements),
}));

export const productUnitsRelations = relations(productUnits, ({ one }) => ({
  product: one(products, { fields: [productUnits.productId], references: [products.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
  ledger: many(customerLedger),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  intakes: many(stockIntakes),
  ledger: many(supplierLedger),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  cashier: one(users, { fields: [shifts.cashierId], references: [users.id] }),
  device: one(devices, { fields: [shifts.deviceId], references: [devices.id] }),
  sales: many(sales),
  payments: many(payments),
  expenses: many(expenses),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  cashier: one(users, { fields: [sales.cashierId], references: [users.id] }),
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  shift: one(shifts, { fields: [sales.shiftId], references: [shifts.id] }),
  device: one(devices, { fields: [sales.deviceId], references: [devices.id] }),
  items: many(saleItems),
  payments: many(payments),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
  productUnit: one(productUnits, {
    fields: [saleItems.productUnitId],
    references: [productUnits.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  sale: one(sales, { fields: [payments.saleId], references: [sales.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
  shift: one(shifts, { fields: [payments.shiftId], references: [shifts.id] }),
}));

export const stockIntakesRelations = relations(stockIntakes, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [stockIntakes.supplierId], references: [suppliers.id] }),
  items: many(stockIntakeItems),
}));

export const stockIntakeItemsRelations = relations(stockIntakeItems, ({ one }) => ({
  intake: one(stockIntakes, { fields: [stockIntakeItems.intakeId], references: [stockIntakes.id] }),
  product: one(products, { fields: [stockIntakeItems.productId], references: [products.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
}));

export const customerLedgerRelations = relations(customerLedger, ({ one }) => ({
  customer: one(customers, { fields: [customerLedger.customerId], references: [customers.id] }),
}));

export const supplierLedgerRelations = relations(supplierLedger, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierLedger.supplierId], references: [suppliers.id] }),
}));
