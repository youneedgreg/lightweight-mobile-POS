"use server";

import { CUSTOMER_TYPES, normalizeKenyanPhone, PRICE_TIERS } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { customers, suppliers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { checkbox, firstIssue, optionalText, optionalWholeNumber, type FormState } from "@/lib/forms";

const optionalPhone = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .nullable()
    .transform((value, ctx) => {
      if (value === null) return null;
      const phone = normalizeKenyanPhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Enter a valid Kenyan phone number or leave it empty" });
        return z.NEVER;
      }
      return phone;
    }),
);

const id = z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable());

const customerSchema = z.object({
  id,
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: optionalPhone,
  type: z.enum(CUSTOMER_TYPES),
  priceTier: z.enum(PRICE_TIERS),
  creditLimit: optionalWholeNumber("Credit limit"),
  notes: optionalText(500),
  isActive: checkbox,
});

export async function saveCustomer(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id: customerId, ...values } = parsed.data;

  if (customerId) {
    await db.update(customers).set(values).where(eq(customers.id, customerId));
    await audit({ userId: admin.id, action: "customer.update", entityType: "customer", entityId: customerId, data: values });
    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/admin/customers");
    return { ok: true, message: "Saved." };
  }
  const [created] = await db.insert(customers).values(values).returning({ id: customers.id });
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${created?.id ?? ""}`);
}

const supplierSchema = z.object({
  id,
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: optionalPhone,
  notes: optionalText(500),
  isActive: checkbox,
});

export async function saveSupplier(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id: supplierId, ...values } = parsed.data;

  if (supplierId) {
    await db.update(suppliers).set(values).where(eq(suppliers.id, supplierId));
    await audit({ userId: admin.id, action: "supplier.update", entityType: "supplier", entityId: supplierId, data: values });
    revalidatePath(`/admin/suppliers/${supplierId}`);
    revalidatePath("/admin/suppliers");
    return { ok: true, message: "Saved." };
  }
  const [created] = await db.insert(suppliers).values(values).returning({ id: suppliers.id });
  revalidatePath("/admin/suppliers");
  redirect(`/admin/suppliers/${created?.id ?? ""}`);
}
