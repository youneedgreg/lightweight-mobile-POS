import { formatKes } from "@liquor-pos/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import { listSuppliers, type Supplier } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { useSync } from "@/sync/sync-provider";

export default function SuppliersScreen() {
  const db = useDatabase();
  const { status } = useSync();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listSuppliers(db).then((rows) => {
      if (!cancelled) setSuppliers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db, status.catalogVersion, status.pending]);

  const total = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title="Suppliers" />
      <Text className="px-4 pb-2 text-sm text-neutral-500">
        We owe: {formatKes(total)} · add suppliers on the web dashboard
      </Text>
      <FlatList
        data={suppliers}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/supplier/[id]", params: { id: item.id } })}
            accessibilityRole="button"
            className="flex-row items-center border-b border-neutral-100 px-4 py-3 active:bg-neutral-100 dark:border-neutral-900 dark:active:bg-neutral-900"
          >
            <View className="flex-1">
              <Text className="text-base font-medium text-neutral-900 dark:text-white">{item.name}</Text>
              {item.phone && <Text className="text-xs text-neutral-500">{item.phone}</Text>}
            </View>
            <Text className={`text-base font-semibold ${item.balance > 0 ? "text-amber-700 dark:text-amber-400" : "text-neutral-500"}`}>
              {formatKes(item.balance)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text className="px-6 py-12 text-center text-neutral-500">No suppliers yet.</Text>}
      />
    </SafeAreaView>
  );
}
