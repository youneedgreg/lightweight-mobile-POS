import "server-only";

import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * Hash of a random throwaway value. Compared against when a login names an
 * unknown user, so unknown and known accounts take the same time to reject.
 */
const DUMMY_HASH = "$2b$12$qODvSx2sl2OhQCmcCJ0Qk.2MiM/F0B3vbi6tPyLJX/ZWZhafUo3b6";

/** Hashes a password or PIN. */
export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_COST);
}

/** Compares a password or PIN against a stored hash (or a dummy hash when there is none). */
export function verifySecret(secret: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(secret, hash ?? DUMMY_HASH).then((match) => match && hash !== null);
}
