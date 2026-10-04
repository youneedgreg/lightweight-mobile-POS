import { mobileLoginResponseSchema, type MobileLoginResponse } from "@liquor-pos/shared";

import { secureStorage } from "@/lib/secure-storage";

/** The stored session is exactly the login response: token, expiry, user and device. */
export type Session = MobileLoginResponse;

const SESSION_KEY = "auth.session";
const LAST_PHONE_KEY = "auth.lastPhone";

export async function loadSession(): Promise<Session | null> {
  const raw = await secureStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = mobileLoginResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await secureStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (session.user.phone) await secureStorage.setItem(LAST_PHONE_KEY, session.user.phone);
}

export async function clearSession(): Promise<void> {
  await secureStorage.removeItem(SESSION_KEY);
}

/** Last phone number that logged in on this device, to prefill the login form. */
export function loadLastPhone(): Promise<string | null> {
  return secureStorage.getItem(LAST_PHONE_KEY);
}

export function isExpired(session: Session, now = Date.now()): boolean {
  return new Date(session.expiresAt).getTime() <= now;
}
