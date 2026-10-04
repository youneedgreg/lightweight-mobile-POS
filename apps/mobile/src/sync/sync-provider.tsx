import * as Network from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { useAuth } from "@/auth/auth-provider";
import { useDatabase } from "@/db/database-provider";
import { ApiRequestError } from "@/lib/api";

import { getLastSyncedAt, getQueueCounts, retryRejected, runSync } from "./sync-engine";

/** Background sync cadence while the app is open. */
const SYNC_INTERVAL_MS = 60_000;

export interface SyncStatus {
  syncing: boolean;
  /** Records (sales, payments, expenses…) waiting to upload. */
  pending: number;
  /** Records the server refused; need the owner's attention. */
  rejected: number;
  lastSyncedAt: string | null;
  /** Last failure, e.g. "No connection to the server." Cleared on success. */
  lastError: string | null;
  /** Bumped after every catalog pull so screens can reload products. */
  catalogVersion: number;
}

interface SyncContextValue {
  status: SyncStatus;
  /** Starts a sync (or joins the one running). Never throws. */
  syncNow: () => Promise<void>;
  /** Re-reads queue counts after local changes (e.g. a completed sale). */
  refreshCounts: () => Promise<void>;
  retryRejected: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Runs the sync engine whenever it is likely to succeed: on sign-in, when the
 * network comes back, when the app returns to the foreground, every minute,
 * and right after each sale. Only one sync runs at a time.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const { state, signOut } = useAuth();
  const token = state.status === "signedIn" ? state.session.token : null;
  const role = state.status === "signedIn" ? state.session.user.role : null;

  const [status, setStatus] = useState<SyncStatus>({
    syncing: false,
    pending: 0,
    rejected: 0,
    lastSyncedAt: null,
    lastError: null,
    catalogVersion: 0,
  });
  const running = useRef<Promise<void> | null>(null);

  const refreshCounts = useCallback(async () => {
    const [counts, lastSyncedAt] = await Promise.all([getQueueCounts(db), getLastSyncedAt(db)]);
    setStatus((s) => ({ ...s, ...counts, lastSyncedAt }));
  }, [db]);

  const syncNow = useCallback(async () => {
    if (!token || !role) return;
    if (running.current) return running.current;

    const task = (async () => {
      setStatus((s) => ({ ...s, syncing: true }));
      try {
        await runSync(db, token, role);
        setStatus((s) => ({ ...s, lastError: null, catalogVersion: s.catalogVersion + 1 }));
      } catch (error) {
        if (error instanceof ApiRequestError && error.isAuthFailure) {
          // Queued sales stay on the phone and upload after the next login.
          await signOut(error.message);
          return;
        }
        const message = error instanceof Error ? error.message : "Sync failed.";
        setStatus((s) => ({ ...s, lastError: message }));
      } finally {
        await refreshCounts().catch(() => undefined);
        setStatus((s) => ({ ...s, syncing: false }));
        running.current = null;
      }
    })();
    running.current = task;
    return task;
  }, [db, token, role, signOut, refreshCounts]);

  const retry = useCallback(async () => {
    await retryRejected(db);
    await refreshCounts();
    await syncNow();
  }, [db, refreshCounts, syncNow]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getQueueCounts(db), getLastSyncedAt(db)]).then(([counts, lastSyncedAt]) => {
      if (!cancelled) setStatus((s) => ({ ...s, ...counts, lastSyncedAt }));
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (!token) return;
    // Deferred so the first sync starts after this render commits.
    const initial = setTimeout(() => void syncNow(), 0);
    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void syncNow();
    });
    const network = Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      if (isConnected && isInternetReachable !== false) void syncNow();
    });
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      appState.remove();
      network.remove();
    };
  }, [token, syncNow]);

  const value = useMemo(
    () => ({ status, syncNow, refreshCounts, retryRejected: retry }),
    [status, syncNow, refreshCounts, retry],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used inside <SyncProvider>");
  return context;
}
