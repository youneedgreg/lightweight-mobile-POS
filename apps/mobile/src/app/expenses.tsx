import { EXPENSE_CATEGORIES, formatKes, MONEY_METHODS, type ExpenseCategory, type MoneyMethod } from "@liquor-pos/shared";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { Input, Label, MoneyInput, Notice, parseKes, PrimaryButton, ScreenHeader, Segmented } from "@/components/ui";
import { useDatabase } from "@/db/database-provider";
import { listShiftExpenses, recordExpense, type LocalExpense } from "@/db/money-repo";
import { useShift } from "@/pos/shift-provider";
import { useSync } from "@/sync/sync-provider";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  CASUAL_LABOUR: "Casual labour",
  TRANSPORT: "Transport",
  RENT: "Rent",
  UTILITIES: "Utilities",
  SUPPLIES: "Supplies",
  LICENSES: "Licences",
  OTHER: "Other",
};

export default function ExpensesScreen() {
  const db = useDatabase();
  const session = useSession();
  const { shift } = useShift();
  const { refreshCounts, syncNow, status } = useSync();
  const [category, setCategory] = useState<ExpenseCategory>("CASUAL_LABOUR");
  const [method, setMethod] = useState<MoneyMethod>("CASH");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recent, setRecent] = useState<LocalExpense[]>([]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (shift) {
      void listShiftExpenses(db, shift.id).then((rows) => {
        if (!cancelled) setRecent(rows);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [db, shift, status.pending]);

  const value = parseKes(amount);
  const valid = Number.isSafeInteger(value) && value > 0 && description.trim().length > 0;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await recordExpense(db, session, { category, description: description.trim(), amount: value, method });
      setDescription("");
      setAmount("");
      setMessage({ tone: "success", text: `Saved ${formatKes(value)} for ${CATEGORY_LABEL[category].toLowerCase()}.` });
      if (shift) setRecent(await listShiftExpenses(db, shift.id));
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
      <ScreenHeader title="Expenses" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-4 pb-10" keyboardShouldPersistTaps="handled">
          {!shift && <Notice tone="warning">No shift is open, so cash expenses won&apos;t be counted against a till.</Notice>}
          <View className="flex-row flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const selected = c === category;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-full px-3 py-1.5 ${selected ? "bg-neutral-900 dark:bg-white" : "bg-neutral-100 dark:bg-neutral-800"}`}
                >
                  <Text className={`text-sm ${selected ? "text-white dark:text-neutral-900" : "text-neutral-700 dark:text-neutral-300"}`}>
                    {CATEGORY_LABEL[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="gap-2">
            <Label>What for</Label>
            <Input value={description} onChangeText={setDescription} placeholder="e.g. Offloading 20 crates" />
          </View>
          <View className="gap-2">
            <Label>Amount (KES)</Label>
            <MoneyInput value={amount} onChangeText={setAmount} placeholder="Amount" />
          </View>
          <Segmented
            options={MONEY_METHODS.map((m) => ({ value: m, label: m === "CASH" ? "Paid from till (cash)" : "Paid by M-Pesa" }))}
            value={method}
            onChange={setMethod}
          />
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <PrimaryButton title={busy ? "Saving…" : "Save expense"} disabled={!valid || busy} onPress={() => void save()} />

          {recent.length > 0 && (
            <View className="gap-1 pt-2">
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">Cash expenses this shift</Text>
              {recent.map((e) => (
                <View key={e.id} className="flex-row justify-between border-b border-neutral-100 py-2 dark:border-neutral-900">
                  <Text className="flex-1 text-sm text-neutral-700 dark:text-neutral-300">{e.description}</Text>
                  <Text className="text-sm font-medium text-neutral-900 dark:text-white">{formatKes(e.amount)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
