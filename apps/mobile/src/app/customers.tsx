import { formatKes, normalizeKenyanPhone } from "@liquor-pos/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createCustomer, searchCustomers, type Customer } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { useCart } from "@/pos/cart-provider";
import { useSync } from "@/sync/sync-provider";

const inputClass =
  "rounded-xl border border-neutral-300 px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:text-white";

export default function CustomersScreen() {
  const db = useDatabase();
  const { chooseCustomer } = useCart();
  const { status, syncNow } = useSync();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void searchCustomers(db, query).then((found) => {
      if (!cancelled) setCustomers(found);
    });
    return () => {
      cancelled = true;
    };
  }, [db, query, status.catalogVersion]);

  async function pick(customer: Customer) {
    await chooseCustomer(customer);
    router.back();
  }

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter the customer's name.");
      return;
    }
    const normalized = phone.trim() ? normalizeKenyanPhone(phone) : null;
    if (phone.trim() && !normalized) {
      setError("Enter a valid Kenyan phone number, or leave it empty.");
      return;
    }
    const customer = await createCustomer(db, { name: trimmed, phone: normalized });
    void syncNow();
    await pick(customer);
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <View className="flex-row items-center px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} accessibilityRole="button" className="py-2 pr-4">
          <Text className="text-base text-neutral-600 dark:text-neutral-400">‹ Back</Text>
        </Pressable>
        <Text className="flex-1 text-center text-lg font-semibold text-neutral-900 dark:text-white">Customer</Text>
        <View className="w-16" />
      </View>

      {adding ? (
        <View className="gap-3 px-4">
          <TextInput value={name} onChangeText={setName} placeholder="Name" autoFocus className={inputClass} placeholderTextColor="#a3a3a3" />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Phone (optional)" keyboardType="phone-pad" className={inputClass} placeholderTextColor="#a3a3a3" />
          {error && <Text className="text-sm text-red-600">{error}</Text>}
          <View className="flex-row gap-2">
            <Pressable onPress={() => setAdding(false)} accessibilityRole="button" className="flex-1 items-center rounded-xl border border-neutral-300 py-3 dark:border-neutral-700">
              <Text className="text-base text-neutral-900 dark:text-white">Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void add()} accessibilityRole="button" className="flex-1 items-center rounded-xl bg-neutral-900 py-3 dark:bg-white">
              <Text className="text-base font-semibold text-white dark:text-neutral-900">Save and use</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View className="flex-row gap-2 px-4 pb-2">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or phone"
              autoCorrect={false}
              className={`${inputClass} flex-1`}
              placeholderTextColor="#a3a3a3"
            />
            <Pressable onPress={() => setAdding(true)} accessibilityRole="button" className="items-center justify-center rounded-xl bg-neutral-900 px-4 dark:bg-white">
              <Text className="text-base font-semibold text-white dark:text-neutral-900">New</Text>
            </Pressable>
          </View>
          <FlatList
            data={customers}
            keyExtractor={(customer) => customer.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void pick(item)}
                accessibilityRole="button"
                className="flex-row items-center border-b border-neutral-100 px-4 py-3 active:bg-neutral-100 dark:border-neutral-900 dark:active:bg-neutral-900"
              >
                <View className="flex-1">
                  <Text className="text-base font-medium text-neutral-900 dark:text-white">{item.name}</Text>
                  <Text className="text-xs text-neutral-500">
                    {[item.phone, item.type === "PROMOTER" ? "Promoter" : null, item.priceTier === "WHOLESALE" ? "Wholesale" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {item.balance !== 0 && (
                  <Text className={`text-sm font-medium ${item.balance > 0 ? "text-amber-700 dark:text-amber-400" : "text-green-700"}`}>
                    {item.balance > 0 ? `Owes ${formatKes(item.balance)}` : `Credit ${formatKes(-item.balance)}`}
                  </Text>
                )}
              </Pressable>
            )}
            ListEmptyComponent={<Text className="px-6 py-12 text-center text-neutral-500">No customers found.</Text>}
          />
        </>
      )}
    </SafeAreaView>
  );
}
