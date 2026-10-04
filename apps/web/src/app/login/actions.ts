"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { signIn, type LoginErrorCode } from "@/auth";

export interface LoginState {
  error: string | null;
  email: string;
}

const MESSAGES: Record<LoginErrorCode, string> = {
  invalid_credentials: "Wrong email or password.",
  account_locked: "Too many failed attempts. Try again in 15 minutes.",
};

/** Only allow redirects back into the admin area, never to another origin. */
function safeRedirect(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/admin") && !value.startsWith("//")
    ? value
    : "/admin";
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: safeRedirect(formData.get("callbackUrl")),
    });
    return { error: null, email };
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      const code = error.code as LoginErrorCode;
      return { error: MESSAGES[code] ?? MESSAGES.invalid_credentials, email };
    }
    if (error instanceof AuthError) {
      return { error: "Could not sign in. Please try again.", email };
    }
    // signIn signals success by throwing a redirect, which must propagate.
    throw error;
  }
}
