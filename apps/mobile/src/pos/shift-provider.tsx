import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useSession } from "@/auth/auth-provider";
import { useDatabase } from "@/db/database-provider";
import { closeShift, getCurrentShift, openShift, type Shift, type ShiftSummary } from "@/db/shift-repo";
import { useSync } from "@/sync/sync-provider";

interface ShiftContextValue {
  /** The open shift on this phone, null when closed, undefined while loading. */
  shift: Shift | null | undefined;
  open: (openingFloat: number) => Promise<void>;
  close: (countedCash: number, notes: string | null) => Promise<ShiftSummary & { countedCash: number }>;
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

/** The till session. Selling requires an open shift so every shilling is counted at close. */
export function ShiftProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const session = useSession();
  const { refreshCounts, syncNow } = useSync();
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getCurrentShift(db).then((current) => {
      if (!cancelled) setShift(current);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const open = useCallback(
    async (openingFloat: number) => {
      setShift(await openShift(db, session, openingFloat));
      await refreshCounts();
      void syncNow();
    },
    [db, session, refreshCounts, syncNow],
  );

  const close = useCallback(
    async (countedCash: number, notes: string | null) => {
      const summary = await closeShift(db, session, { countedCash, notes });
      setShift(null);
      await refreshCounts();
      void syncNow();
      return summary;
    },
    [db, session, refreshCounts, syncNow],
  );

  const value = useMemo(() => ({ shift, open, close }), [shift, open, close]);
  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift(): ShiftContextValue {
  const context = useContext(ShiftContext);
  if (!context) throw new Error("useShift must be used inside <ShiftProvider>");
  return context;
}
