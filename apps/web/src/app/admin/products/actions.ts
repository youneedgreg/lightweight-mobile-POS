"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { categories, productUnits, products, stockMovements } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import {
  checkbox,
  firstIssue,
  isUniqueViolation,
  optionalText,
  optionalWholeNumber,
  wholeNumber,
  type FormState,
} from "@/lib/forms";

const productSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
    name: z.string().trim().min(1, "Name is required").max(120),
    size: optionalText(40),
    barcode: optionalText(64),
    categoryId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
    newCategory: optionalText(60),
    retailPrice: wholeNumber("Retail price"),
    wholesalePrice: optionalWholeNumber("Wholesale price"),
    reorderLevel: wholeNumber("Reorder level"),
    isReturnable: checkbox,
    depositAmount: wholeNumber("Deposit"),
    isActive: checkbox,
    costPrice: optionalWholeNumber("Cost price"),
    // Only used when creating a product.
    openingStock: optionalWholeNumber("Opening stock"),
  })
  .refine((p) => !p.isReturnable || p.depositAmount > 0, {
    message: "Returnable bottles need a deposit amount",
    path: ["depositAmount"],
  });

async function resolveCategory(categoryId: string | null, newCategory: string | null): Promise<string | null> {
  if (!newCategory) return categoryId;
  const [row] = await db
    .insert(categories)
    .values({ name: newCategory })
    .onConflictDoUpdate({ target: categories.name, set: { name: newCategory } })
    .returning({ id: categories.id });
  return row?.id ?? categoryId;
}

export async function saveProduct(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const input = parsed.data;

  const values = {
    name: input.name,
    size: input.size,
    barcode: input.barcode,
    categoryId: await resolveCategory(input.categoryId, input.newCategory),
    retailPrice: input.retailPrice,
    wholesalePrice: input.wholesalePrice,
    reorderLevel: input.reorderLevel,
    isReturnable: input.isReturnable,
    depositAmount: input.isReturnable ? input.depositAmount : 0,
    isActive: input.isActive,
  };

  let productId: string;
  try {
    if (input.id) {
      const before = await db.query.products.findFirst({ where: eq(products.id, input.id) });
      if (!before) return { ok: false, message: "Product not found." };
      const costPrice = input.costPrice ?? before.costPrice;
      await db.transaction(async (tx) => {
        await tx.update(products).set({ ...values, costPrice }).where(eq(products.id, input.id as string));
        if (
          before.retailPrice !== values.retailPrice ||
          before.wholesalePrice !== values.wholesalePrice ||
          before.costPrice !== costPrice
        ) {
          await audit(
            {
              userId: admin.id,
              action: "product.price_change",
              entityType: "product",
              entityId: before.id,
              data: {
                retail: [before.retailPrice, values.retailPrice],
                wholesale: [before.wholesalePrice, values.wholesalePrice],
                cost: [before.costPrice, costPrice],
              },
            },
            tx,
          );
        }
      });
      productId = input.id;
    } else {
      productId = await db.transaction(async (tx) => {
        const opening = input.openingStock ?? 0;
        const [created] = await tx
          .insert(products)
          .values({ ...values, costPrice: input.costPrice ?? 0, stockOnHand: opening })
          .returning({ id: products.id });
        if (!created) throw new Error("Insert returned no row");
        if (opening > 0) {
          await tx.insert(stockMovements).values({
            productId: created.id,
            type: "ADJUSTMENT",
            quantity: opening,
            userId: admin.id,
            reason: "Opening stock",
          });
        }
        await audit({ userId: admin.id, action: "product.create", entityType: "product", entityId: created.id }, tx);
        return created.id;
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "That barcode is already used by another product." };
    throw error;
  }

  revalidatePath("/admin/products");
  if (!input.id) redirect(`/admin/products/${productId}`);
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, message: "Saved. Phones pick up the change on their next sync." };
}

const packSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
    productId: z.uuid(),
    name: z.string().trim().min(1, "Pack name is required").max(40),
    barcode: optionalText(64),
    unitsPerPack: wholeNumber("Bottles per pack"),
    retailPrice: optionalWholeNumber("Pack retail price"),
    wholesalePrice: optionalWholeNumber("Pack wholesale price"),
    isActive: checkbox,
  })
  .refine((p) => p.unitsPerPack >= 2, { message: "A pack holds at least 2 bottles", path: ["unitsPerPack"] });

export async function savePack(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = packSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id, productId, ...values } = parsed.data;

  try {
    if (id) {
      await db.update(productUnits).set(values).where(eq(productUnits.id, id));
    } else {
      const [created] = await db.insert(productUnits).values({ productId, ...values }).returning({ id: productUnits.id });
      if (created) {
        await audit({ userId: admin.id, action: "product_unit.create", entityType: "product_unit", entityId: created.id, data: { productId } });
      }
    }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "That barcode is already used." };
    throw error;
  }

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, message: id ? "Pack saved." : "Pack added." };
}
