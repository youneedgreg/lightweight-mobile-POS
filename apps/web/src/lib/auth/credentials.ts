import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

import { verifySecret } from "./password";

/** Failed attempts before an account is locked. */
export const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

type User = typeof users.$inferSelect;

export type CredentialsResult =
  | { ok: true; user: User }
  | { ok: false; code: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "ACCOUNT_DISABLED" };

/** Admin web login: email + password. Only ADMIN users may sign in to the dashboard. */
export async function verifyAdminPassword(email: string, password: string): Promise<CredentialsResult> {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  return checkSecret(user, password, (u) => (u.role === "ADMIN" ? u.passwordHash : null));
}

/** Mobile login: phone (E.164) + PIN. Any role with a PIN may use the POS app. */
export async function verifyPhonePin(phone: string, pin: string): Promise<CredentialsResult> {
  const user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  return checkSecret(user, pin, (u) => u.pinHash);
}

async function checkSecret(
  user: User | undefined,
  secret: string,
  getHash: (user: User) => string | null,
): Promise<CredentialsResult> {
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, code: "ACCOUNT_LOCKED" };
  }

  // Always run bcrypt, even for unknown users, so response time doesn't reveal which accounts exist.
  const valid = await verifySecret(secret, user ? getHash(user) : null);

  if (!user || !valid) {
    if (user) await recordFailedLogin(user.id);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  if (!user.isActive) {
    return { ok: false, code: "ACCOUNT_DISABLED" };
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }
  return { ok: true, user };
}

/**
 * Atomically counts a failure and locks the account once the limit is reached.
 * The counter only resets on a successful login or an admin PIN/password reset,
 * so each further failure after a lock expires re-locks immediately.
 */
async function recordFailedLogin(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
      lockedUntil: sql`CASE WHEN ${users.failedLoginAttempts} + 1 >= ${MAX_FAILED_LOGINS}
        THEN now() + make_interval(mins => ${LOCK_MINUTES})
        ELSE ${users.lockedUntil} END`,
    })
    .where(eq(users.id, userId));
}
