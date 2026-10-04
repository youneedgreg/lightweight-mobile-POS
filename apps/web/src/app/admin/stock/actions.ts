"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { firstIssue, type FormState } from "@/lib/forms";

import { ADJUSTMENT_REASONS } from "./reasons";

const adjustmentSchema = z.object({
  productId: z.uuid(),
  mode: z.enum(["count", "change"]),
  value: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
    z.coerce.number({ error: "Enter a number" }).int("Whole bottles only"),
  ),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(200).nullable()),
});

/**
 * Manual stock correction. "count" sets stock to what was physically
 * counted; "change" adds or removes bottles (e.g. −2 broken). The product row
 * is locked so a sale syncing at the same moment can't skew a recount.
 */
export async function adjustStock(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { productId, mode, value, reason, note } = parsed.data;
  if (mode === "count" && value < 0) return { ok: false, message: "A count can't be negative." };

  const result = await db.transaction(async (tx) => {
    const [product] = await tx
      .select({ stockOnHand: products.stockOnHand, name: products.name })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) return { ok: false as const, message: "Product not found." };

    const delta = mode === "count" ? value - product.stockOnHand : value;
    if (delta === 0) return { ok: false as const, message: "No change: stock already matches." };

    const reasonText = note ? `${reason}: ${note}` : reason;
    await tx.insert(stockMovements).values({
      productId,
      type: "ADJUSTMENT",
      quantity: delta,
      userId: admin.id,
      reason: reasonText,
    });
    await tx
      .update(products)
      .set({ stockOnHand: product.stockOnHand + delta })
      .where(eq(products.id, productId));
    await audit(
      {
        userId: admin.id,
        action: "stock.adjust",
        entityType: "product",
        entityId: productId,
        data: { before: product.stockOnHand, after: product.stockOnHand + delta, delta, reason: reasonText },
      },
      tx,
    );
    return {
      ok: true as const,
      message: `${product.name}: ${product.stockOnHand} → ${product.stockOnHand + delta} (${delta > 0 ? "+" : ""}${delta}).`,
    };
  });

  revalidatePath("/admin/stock");
  revalidatePath("/admin");
  return result;
}
