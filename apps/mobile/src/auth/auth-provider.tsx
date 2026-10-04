import { meResponseSchema, mobileLoginResponseSchema } from "@liquor-pos/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiRequest, ApiRequestError } from "@/lib/api";
import { getDeviceId, getDeviceLabel } from "@/lib/device";

import { clearSession, isExpired, loadSession, saveSession, type Session } from "./session-storage";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice: string | null }
  | { status: "signedIn"; session: Session };

interface AuthContextValue {
  state: AuthState;
  /** Throws ApiRequestError with a user-facing message on failure. */
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Offline-first session handling: a stored, unexpired token signs the user in
 * immediately (no network needed). The token is then re-validated in the
 * background, and only an explicit rejection from the server signs them out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const signOut = useCallback(async (notice?: string) => {
    await clearSession();
    setState({ status: "signedOut", notice: notice ?? null });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const session = await loadSession();
      if (cancelled) return;
      if (!session) {
        setState({ status: "signedOut", notice: null });
        return;
      }
      if (isExpired(session)) {
        await clearSession();
        if (!cancelled) setState({ status: "signedOut", notice: "Your session expired. Log in again." });
        return;
      }
      setState({ status: "signedIn", session });

      try {
        const me = await apiRequest("/api/mobile/me", { token: session.token, schema: meResponseSchema });
        if (cancelled || !me.device) return;
        const refreshed: Session = { ...session, user: me.user, device: me.device };
        await saveSession(refreshed);
        if (!cancelled) setState({ status: "signedIn", session: refreshed });
      } catch (error) {
        // Offline or server hiccup: keep working with the stored session.
        if (!cancelled && error instanceof ApiRequestError && error.isAuthFailure) {
          await signOut(error.message);
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  const signIn = useCallback(async (phone: string, pin: string) => {
    const session = await apiRequest("/api/mobile/auth/login", {
      method: "POST",
      body: { phone, pin, deviceId: await getDeviceId(), deviceLabel: getDeviceLabel() },
      schema: mobileLoginResponseSchema,
    });
    await saveSession(session);
    setState({ status: "signedIn", session });
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

/** The current session. Only call from screens behind the signed-in route guard. */
export function useSession(): Session {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("useSession called while signed out");
  return state.session;
}
