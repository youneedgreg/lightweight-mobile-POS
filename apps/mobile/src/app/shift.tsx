import { formatKes } from "@liquor-pos/shared";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Input, Label, MoneyInput, Notice, parseKes, PrimaryButton, ScreenHeader } from "@/components/ui";
import { useDatabase } from "@/db/database-provider";
import { CASH_KIND_LABEL, summarizeShift, type ShiftSummary } from "@/db/shift-repo";
import { goBack } from "@/lib/navigation";
import { useShift } from "@/pos/shift-provider";
import { useSync } from "@/sync/sync-provider";

const time = (iso: string) => new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

export default function ShiftScreen() {
  const db = useDatabase();
  const { shift, open, close } = useShift();
  const { status } = useSync();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [closed, setClosed] = useState<(ShiftSummary & { countedCash: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (shift) {
      void summarizeShift(db, shift).then((s) => {
        if (!cancelled) setSummary(s);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [db, shift, status.pending]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const value = parseKes(amount);
  const valid = Number.isSafeInteger(value) && value >= 0;

  if (closed) {
    const difference = closed.countedCash - closed.expectedCash;
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
        <ScreenHeader title="Shift closed" />
        <View className="flex-1 gap-4 px-6 pt-6">
          <Row label="Expected in drawer" value={formatKes(closed.expectedCash)} />
          <Row label="Counted" value={formatKes(closed.countedCash)} />
          <View
            className={`items-center rounded-2xl px-6 py-5 ${difference === 0 ? "bg-green-100 dark:bg-green-950" : difference < 0 ? "bg-red-100 dark:bg-red-950" : "bg-amber-100 dark:bg-amber-950"}`}
          >
            <Text className="text-base text-neutral-800 dark:text-neutral-200">
              {difference === 0 ? "Till balances" : difference < 0 ? "Short" : "Over"}
            </Text>
            <Text className="text-4xl font-bold text-neutral-900 dark:text-white">{formatKes(Math.abs(difference))}</Text>
          </View>
          <Text className="text-center text-sm text-neutral-500">The owner sees this on the dashboard once it uploads.</Text>
        </View>
        <View className="px-6 pb-8">
          <PrimaryButton title="Done" onPress={() => goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title={shift ? "Close shift" : "Open shift"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8" keyboardShouldPersistTaps="handled">
          {shift === undefined ? null : shift === null ? (
            <>
              <Text className="text-base text-neutral-700 dark:text-neutral-300">
                Count the cash in the drawer before you start selling. This is your opening float.
              </Text>
              <View className="gap-2">
                <Label>Opening float (KES)</Label>
                <MoneyInput value={amount} onChangeText={setAmount} placeholder="e.g. 2000" autoFocus />
              </View>
              {error && <Notice tone="error">{error}</Notice>}
              <PrimaryButton
                title={busy ? "Opening…" : "Open shift"}
                disabled={!valid || busy}
                onPress={() =>
                  void run(async () => {
                    await open(value);
                    setAmount("");
                    goBack();
                  })
                }
              />
            </>
          ) : (
            <>
              <Text className="text-sm text-neutral-500">
                Opened {time(shift.openedAt)}
                {shift.cashierName ? ` by ${shift.cashierName}` : ""}
              </Text>
              {summary && (
                <View className="gap-1 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
                  <Row label="Opening float" value={formatKes(summary.openingFloat)} />
                  {summary.byKind
                    .filter((row) => row.amount !== 0)
                    .map((row) => (
                      <Row key={row.kind} label={CASH_KIND_LABEL[row.kind]} value={formatKes(row.amount)} />
                    ))}
                  <View className="mt-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                    <Row label="Expected cash in drawer" value={formatKes(summary.expectedCash)} bold />
                  </View>
                  <Text className="mt-1 text-xs text-neutral-500">M-Pesa and credit don&apos;t go in the drawer, so they&apos;re not counted here.</Text>
                </View>
              )}
              <View className="gap-2">
                <Label>Cash counted in drawer (KES)</Label>
                <MoneyInput value={amount} onChangeText={setAmount} placeholder="Count the drawer" />
              </View>
              <View className="gap-2">
                <Label>Notes (optional)</Label>
                <Input value={notes} onChangeText={setNotes} placeholder="e.g. KES 50 note was torn" />
              </View>
              {error && <Notice tone="error">{error}</Notice>}
              <PrimaryButton
                title={busy ? "Closing…" : "Close shift"}
                tone="red"
                disabled={!valid || busy}
                onPress={() =>
                  void run(async () => {
                    setClosed(await close(value, notes.trim() || null));
                  })
                }
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  const text = bold ? "text-base font-bold text-neutral-900 dark:text-white" : "text-base text-neutral-700 dark:text-neutral-300";
  return (
    <View className="flex-row justify-between">
      <Text className={text}>{label}</Text>
      <Text className={text}>{value}</Text>
    </View>
  );
}
