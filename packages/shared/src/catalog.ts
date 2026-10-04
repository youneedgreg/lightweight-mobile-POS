import { z } from "zod";

import { CUSTOMER_TYPES, PRICE_TIERS } from "./enums";

/**
 * Catalog data the server sends to phones. Phones keep a full copy in SQLite
 * and pull only rows changed since their last cursor.
 */

const kes = z.number().int();

export const catalogProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  size: z.string().nullable(),
  barcode: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  retailPrice: kes,
  wholesalePrice: kes.nullable(),
  stockOnHand: z.number().int(),
  isReturnable: z.boolean(),
  depositAmount: kes,
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

export const catalogUnitSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  name: z.string(),
  barcode: z.string().nullable(),
  unitsPerPack: z.number().int().min(2),
  retailPrice: kes.nullable(),
  wholesalePrice: kes.nullable(),
  isActive: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CatalogUnit = z.infer<typeof catalogUnitSchema>;

export const catalogCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;

export const catalogCustomerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  type: z.enum(CUSTOMER_TYPES),
  priceTier: z.enum(PRICE_TIERS),
  creditLimit: kes.nullable(),
  /** Amount the customer owes us right now (SUM of their ledger). */
  balance: kes,
  isActive: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CatalogCustomer = z.infer<typeof catalogCustomerSchema>;

export const catalogResponseSchema = z.object({
  /** Pass back as `since` on the next pull. */
  cursor: z.iso.datetime({ offset: true }),
  products: z.array(catalogProductSchema),
  units: z.array(catalogUnitSchema),
  categories: z.array(catalogCategorySchema),
  customers: z.array(catalogCustomerSchema),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;
