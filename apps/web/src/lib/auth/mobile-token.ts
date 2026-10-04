import "server-only";

import { USER_ROLES, type UserRole } from "@liquor-pos/shared";
import { jwtVerify, SignJWT } from "jose";

const ISSUER = "liquor-pos";
const AUDIENCE = "liquor-pos-mobile";
/**
 * Long enough for a phone to stay signed in through offline stretches.
 * Revocation is immediate regardless, via users.token_version and device.is_active.
 */
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface MobileTokenClaims {
  userId: string;
  role: UserRole;
  deviceId: string;
  tokenVersion: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MOBILE_JWT_SECRET must be set (at least 32 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(
  claims: MobileTokenClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    role: claims.role,
    did: claims.deviceId,
    ver: claims.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
  return { token, expiresAt };
}

/** Returns the claims for a valid, unexpired token, or null for anything else. */
export async function verifyMobileToken(token: string): Promise<MobileTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    const { sub, role, did, ver } = payload;
    if (
      typeof sub !== "string" ||
      typeof did !== "string" ||
      typeof ver !== "number" ||
      !USER_ROLES.includes(role as UserRole)
    ) {
      return null;
    }
    return { userId: sub, role: role as UserRole, deviceId: did, tokenVersion: ver };
  } catch {
    return null;
  }
}
