import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { getDatabase, type Database } from "./database";

const DatabaseContext = createContext<Database | null>(null);

/** Opens and migrates the local database before rendering the app. */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabase().then(setDb, (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, []);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-neutral-950">
        <Text className="text-center text-base text-red-600">Could not open the local database: {error}</Text>
      </View>
    );
  }
  if (!db) return null;
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error("useDatabase must be used inside <DatabaseProvider>");
  return db;
}
