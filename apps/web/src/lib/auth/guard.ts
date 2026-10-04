import "server-only";

import type { UserRole } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { devices, users } from "@/db/schema";
import { apiError } from "@/lib/http";

import { verifyMobileToken } from "./mobile-token";

/** The authenticated caller of an API route. */
export interface Principal {
  userId: string;
  role: UserRole;
  /** "mobile" = bearer token from the POS app, "web" = Auth.js session cookie. */
  via: "mobile" | "web";
  /** Set for mobile callers; the token is bound to one device. */
  deviceId: string | null;
}

type AuthResult = { principal: Principal } | { response: Response };

/**
 * Identifies the caller from either a mobile bearer token or the web session
 * cookie, and re-checks the database so disabled users, reset PINs and
 * disabled devices lose access immediately.
 */
export async function authenticate(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    const claims = await verifyMobileToken(header.slice("Bearer ".length).trim());
    if (!claims) return { response: apiError("UNAUTHORIZED", "Session expired. Log in again.") };

    const [user, device] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, claims.userId),
        columns: { id: true, role: true, isActive: true, tokenVersion: true },
      }),
      db.query.devices.findFirst({
        where: eq(devices.id, claims.deviceId),
        columns: { isActive: true },
      }),
    ]);

    if (!user || user.tokenVersion !== claims.tokenVersion) {
      return { response: apiError("UNAUTHORIZED", "Session expired. Log in again.") };
    }
    if (!user.isActive) return { response: apiError("ACCOUNT_DISABLED", "This account is disabled.") };
    if (!device?.isActive) return { response: apiError("DEVICE_DISABLED", "This device is disabled.") };

    // Role comes from the database, not the token, so role changes apply immediately.
    return {
      principal: { userId: user.id, role: user.role, via: "mobile", deviceId: claims.deviceId },
    };
  }

  const session = await auth();
  if (!session?.user?.id) return { response: apiError("UNAUTHORIZED", "Not signed in.") };

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, role: true, isActive: true },
  });
  if (!user?.isActive) return { response: apiError("UNAUTHORIZED", "Not signed in.") };

  return { principal: { userId: user.id, role: user.role, via: "web", deviceId: null } };
}

/**
 * Wraps a route handler so it only runs for authenticated callers with one of
 * the allowed roles.
 *
 *   export const GET = withAuth(["ADMIN"], async (request, context, principal) => { ... });
 */
export function withAuth<Context>(
  roles: readonly UserRole[],
  handler: (request: Request, context: Context, principal: Principal) => Promise<Response>,
): (request: Request, context: Context) => Promise<Response> {
  return async (request, context) => {
    const result = await authenticate(request);
    if ("response" in result) return result.response;
    if (!roles.includes(result.principal.role)) {
      return apiError("FORBIDDEN", "You don't have permission to do that.");
    }
    return handler(request, context, result.principal);
  };
}

export const ANY_ROLE = ["ADMIN", "CASHIER"] as const satisfies readonly UserRole[];
