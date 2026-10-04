import { formatKes } from "@liquor-pos/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Input, ScreenHeader } from "@/components/ui";
import { listDebtors, type Customer } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { useSync } from "@/sync/sync-provider";

export default function DebtsScreen() {
  const db = useDatabase();
  const { status } = useSync();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listDebtors(db, query).then((rows) => {
      if (!cancelled) setCustomers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db, query, status.catalogVersion, status.pending]);

  const total = customers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title="Customer debts" />
      <View className="gap-2 px-4 pb-2">
        <Text className="text-sm text-neutral-500">Owed to us: {formatKes(total)}</Text>
        <Input value={query} onChangeText={setQuery} placeholder="Find any customer by name or phone" autoCorrect={false} />
      </View>
      <FlatList
        data={customers}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/debt/[id]", params: { id: item.id } })}
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
        ListEmptyComponent={<Text className="px-6 py-12 text-center text-neutral-500">Nobody owes anything.</Text>}
      />
    </SafeAreaView>
  );
}
