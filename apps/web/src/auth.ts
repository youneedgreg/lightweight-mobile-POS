import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { USER_ROLES, type UserRole } from "@liquor-pos/shared";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { verifyAdminPassword } from "@/lib/auth/credentials";

/** Error codes surfaced to the login form via `CredentialsSignin.code`. */
export const LOGIN_ERROR_CODES = ["invalid_credentials", "account_locked"] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

class InvalidCredentials extends CredentialsSignin {
  code: LoginErrorCode = "invalid_credentials";
}
class AccountLocked extends CredentialsSignin {
  code: LoginErrorCode = "account_locked";
}

const adminLoginSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(1).max(200),
});

/**
 * Web dashboard auth (admins only). Mobile cashiers use PIN login at
 * /api/mobile/auth/login, which issues its own bearer token.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // The adapter is kept for future OAuth/email providers. Credentials sign-in
  // requires the JWT session strategy, so the session table is not used yet.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = adminLoginSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentials();

        const result = await verifyAdminPassword(parsed.data.email, parsed.data.password);
        if (!result.ok) {
          throw result.code === "ACCOUNT_LOCKED" ? new AccountLocked() : new InvalidCredentials();
        }
        const { id, name, email, role } = result.user;
        return { id, name, email, role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id && user.role) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string" && USER_ROLES.includes(token.role as UserRole)) {
        session.user.id = token.id;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
});
