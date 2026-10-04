import { formatKes } from "@liquor-pos/shared";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { Label, MoneyInput, Notice, parseKes, PrimaryButton, ScreenHeader } from "@/components/ui";
import { listReturnableProducts, type Product } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { recordEmptiesReturn } from "@/db/money-repo";
import { useShift } from "@/pos/shift-provider";
import { useSync } from "@/sync/sync-provider";

/** A customer brings back empty bottles they paid a deposit on; refund the deposit from the till. */
export default function EmptiesScreen() {
  const db = useDatabase();
  const session = useSession();
  const { shift } = useShift();
  const { refreshCounts, syncNow } = useSync();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listReturnableProducts(db).then((rows) => {
      if (!cancelled) setProducts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const count = parseKes(quantity);
  const valid = selected !== null && Number.isSafeInteger(count) && count > 0;
  const refund = valid ? count * selected.depositAmount : 0;

  async function save() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordEmptiesReturn(db, session, {
        productId: selected.id,
        productName: selected.name,
        quantity: count,
        depositRefunded: refund,
      });
      setMessage({ tone: "success", text: `Give the customer ${formatKes(refund)} for ${count} empt${count === 1 ? "y" : "ies"}.` });
      setQuantity("");
      await refreshCounts();
      void syncNow();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title="Return empties" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-4 pb-10" keyboardShouldPersistTaps="handled">
          {!shift && <Notice tone="warning">No shift is open, so the refund won&apos;t be counted against a till.</Notice>}
          <Label>Which bottles?</Label>
          {products.length === 0 && (
            <Text className="text-sm text-neutral-500">No returnable products. Mark bottles as returnable on the web dashboard.</Text>
          )}
          <View className="gap-2">
            {products.map((product) => {
              const isSelected = selected?.id === product.id;
              return (
                <Pressable
                  key={product.id}
                  onPress={() => setSelected(product)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${isSelected ? "border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800" : "border-neutral-200 dark:border-neutral-800"}`}
                >
                  <Text className="text-base text-neutral-900 dark:text-white">
                    {product.name} {product.size ?? ""}
                  </Text>
                  <Text className="text-sm text-neutral-500">{formatKes(product.depositAmount)} each</Text>
                </Pressable>
              );
            })}
          </View>
          {selected && (
            <View className="gap-2">
              <Label>Number of empty bottles</Label>
              <MoneyInput value={quantity} onChangeText={setQuantity} placeholder="e.g. 24" autoFocus />
            </View>
          )}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <PrimaryButton
            title={busy ? "Saving…" : valid ? `Refund ${formatKes(refund)}` : "Refund deposit"}
            tone="green"
            disabled={!valid || busy}
            onPress={() => void save()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
