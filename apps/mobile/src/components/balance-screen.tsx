import { formatKes, MONEY_METHODS, type MoneyMethod } from "@liquor-pos/shared";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { getCustomer, getSupplier } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { recordCustomerPayment, recordLedgerAdjustment, recordSupplierPayment } from "@/db/money-repo";
import { useSync } from "@/sync/sync-provider";

import { Input, Label, MoneyInput, Notice, parseKes, PrimaryButton, ScreenHeader, Segmented } from "./ui";

const METHOD_OPTIONS = MONEY_METHODS.map((value) => ({ value, label: value === "CASH" ? "Cash" : "M-Pesa" }));

interface Party {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
}

/**
 * Money owed by a customer (party = "customer") or to a supplier
 * (party = "supplier"): record a payment, or (owner) correct the balance.
 */
export function BalanceScreen({ party, id }: { party: "customer" | "supplier"; id: string }) {
  const db = useDatabase();
  const session = useSession();
  const { refreshCounts, syncNow } = useSync();
  const isOwner = session.user.role === "ADMIN";

  const [record, setRecord] = useState<Party | null | undefined>(undefined);
  const [method, setMethod] = useState<MoneyMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"less" | "more">("less");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRecord(party === "customer" ? await getCustomer(db, id) : await getSupplier(db, id));
  }, [db, id, party]);

  useEffect(() => {
    let cancelled = false;
    void (party === "customer" ? getCustomer(db, id) : getSupplier(db, id)).then((found) => {
      if (!cancelled) setRecord(found);
    });
    return () => {
      cancelled = true;
    };
  }, [db, id, party]);

  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      await load();
      await refreshCounts();
      void syncNow();
      setMessage({ tone: "success", text: success });
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  if (record === undefined) return null;
  if (record === null) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
        <ScreenHeader title="Not found" />
      </SafeAreaView>
    );
  }

  const value = parseKes(amount);
  const paymentValid = Number.isSafeInteger(value) && value > 0 && (method === "CASH" || reference.trim().length > 0);
  const adjustValue = parseKes(adjustAmount);
  const adjustValid = Number.isSafeInteger(adjustValue) && adjustValue > 0 && adjustReason.trim().length > 0;
  const owes = party === "customer" ? `${record.name} owes` : "We owe";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title={record.name} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-5 px-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="items-center rounded-2xl bg-neutral-50 py-5 dark:bg-neutral-900">
            <Text className="text-sm text-neutral-500">{owes}</Text>
            <Text className={`text-4xl font-bold ${record.balance > 0 ? "text-amber-700 dark:text-amber-400" : "text-neutral-900 dark:text-white"}`}>
              {formatKes(record.balance)}
            </Text>
            {record.phone && <Text className="text-sm text-neutral-500">{record.phone}</Text>}
          </View>

          {message && <Notice tone={message.tone}>{message.text}</Notice>}

          <View className="gap-3">
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              {party === "customer" ? "Record a payment from the customer" : "Record a payment to the supplier"}
            </Text>
            <Segmented options={METHOD_OPTIONS} value={method} onChange={setMethod} />
            <View className="gap-2">
              <Label>Amount (KES)</Label>
              <MoneyInput value={amount} onChangeText={setAmount} placeholder={record.balance > 0 ? String(record.balance) : "Amount"} />
            </View>
            {method === "MPESA" && (
              <View className="gap-2">
                <Label>M-Pesa code</Label>
                <Input value={reference} onChangeText={(t) => setReference(t.toUpperCase())} autoCapitalize="characters" placeholder="e.g. SJK2ABC123" />
              </View>
            )}
            {party === "supplier" && (
              <View className="gap-2">
                <Label>Note (optional)</Label>
                <Input value={note} onChangeText={setNote} placeholder="e.g. Invoice 1043" />
              </View>
            )}
            <PrimaryButton
              title={busy ? "Saving…" : `Record ${Number.isSafeInteger(value) && value > 0 ? formatKes(value) : "payment"}`}
              tone="green"
              disabled={!paymentValid || busy}
              onPress={() =>
                void run(async () => {
                  const common = { method, amount: value, reference: method === "MPESA" ? reference.trim() : null };
                  if (party === "customer") {
                    await recordCustomerPayment(db, session, { ...common, customerId: record.id, customerName: record.name });
                  } else {
                    await recordSupplierPayment(db, session, { ...common, supplierId: record.id, supplierName: record.name, note: note.trim() || null });
                  }
                  setAmount("");
                  setReference("");
                  setNote("");
                }, "Payment recorded.")
              }
            />
            {method === "CASH" && (
              <Text className="text-xs text-neutral-500">
                {party === "customer" ? "Cash goes into the till for this shift." : "Cash is taken from the till for this shift."}
              </Text>
            )}
          </View>

          {isOwner && (
            <View className="gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">Correct the balance (owner)</Text>
              <Segmented
                options={[
                  { value: "less", label: party === "customer" ? "They owe less" : "We owe less" },
                  { value: "more", label: party === "customer" ? "They owe more" : "We owe more" },
                ]}
                value={adjustDirection}
                onChange={setAdjustDirection}
              />
              <MoneyInput value={adjustAmount} onChangeText={setAdjustAmount} placeholder="Amount" />
              <Input value={adjustReason} onChangeText={setAdjustReason} placeholder="Reason (required)" />
              <PrimaryButton
                title={busy ? "Saving…" : "Save correction"}
                disabled={!adjustValid || busy}
                onPress={() =>
                  void run(async () => {
                    await recordLedgerAdjustment(db, session, {
                      party,
                      partyId: record.id,
                      partyName: record.name,
                      amount: adjustDirection === "more" ? adjustValue : -adjustValue,
                      note: adjustReason.trim(),
                    });
                    setAdjustAmount("");
                    setAdjustReason("");
                  }, "Balance corrected.")
                }
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
