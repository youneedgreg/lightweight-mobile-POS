"use server";

import { phoneSchema, pinSchema } from "@liquor-pos/shared";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { isUniqueViolation } from "@/lib/forms";
import { hashSecret } from "@/lib/auth/password";

export interface FormState {
  ok: boolean;
  message: string | null;
}

const createCashierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: phoneSchema,
  pin: pinSchema,
});

const resetPinSchema = z.object({
  userId: z.string().min(1),
  pin: pinSchema,
});

const setPhoneSchema = z.object({
  userId: z.string().min(1),
  phone: phoneSchema,
});

const setActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

export async function createCashier(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = createCashierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { name, phone, pin } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ name, phone, role: "CASHIER", pinHash: await hashSecret(pin) })
        .returning({ id: users.id });
      if (!created) throw new Error("Insert returned no row");
      await audit(
        { userId: admin.id, action: "user.create", entityType: "user", entityId: created.id, data: { role: "CASHIER", phone } },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "That phone number is already in use." };
    throw error;
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `${name} can now log in on the POS app.` };
}

/** Sets a new PIN, unlocks the account and signs the user out of every phone. */
export async function resetPin(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = resetPinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { userId, pin } = parsed.data;

  const pinHash = await hashSecret(pin);
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(users)
      .set({
        pinHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (rows.length > 0) {
      await audit({ userId: admin.id, action: "user.reset_pin", entityType: "user", entityId: userId }, tx);
    }
    return rows.length > 0;
  });
  if (!updated) return { ok: false, message: "User not found." };

  revalidatePath("/admin/users");
  return { ok: true, message: "PIN updated. Any phones using the old PIN are signed out." };
}

/** Sets the phone number used to log in on the POS app (e.g. for the owner). */
export async function setPhone(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = setPhoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { userId, phone } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ phone }).where(eq(users.id, userId));
      await audit({ userId: admin.id, action: "user.set_phone", entityType: "user", entityId: userId, data: { phone } }, tx);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "That phone number is already in use." };
    throw error;
  }
  revalidatePath("/admin/users");
  return { ok: true, message: "Phone saved." };
}

/** Enables or disables a user. Disabling also revokes their mobile tokens. */
export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = setActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(firstIssue(parsed.error));
  const { userId, active } = parsed.data;
  if (userId === admin.id) throw new Error("You can't disable your own account.");

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        isActive: active,
        ...(active ? {} : { tokenVersion: sql`${users.tokenVersion} + 1` }),
      })
      .where(eq(users.id, userId));
    await audit(
      { userId: admin.id, action: active ? "user.enable" : "user.disable", entityType: "user", entityId: userId },
      tx,
    );
  });

  revalidatePath("/admin/users");
}
