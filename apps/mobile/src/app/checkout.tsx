import {
  cartTotals,
  changeDue,
  checkPayments,
  depositsDue,
  formatKes,
  PAYMENT_METHODS,
  PRICE_TIERS,
  returnableLines,
  type DraftPayment,
  type PaymentMethod,
} from "@liquor-pos/shared";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { useDatabase } from "@/db/database-provider";
import { completeSale } from "@/db/sales-repo";
import { useCart } from "@/pos/cart-provider";
import { useShift } from "@/pos/shift-provider";
import { useSync } from "@/sync/sync-provider";

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", MPESA: "M-Pesa", CREDIT: "Credit" };

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
  /** Cash only: what the customer handed over, to work out change. */
  tendered: string;
}

/** Digits only → whole shillings (NaN when empty). */
const toKes = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text.replace(/[^\d]/g, "")));

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-base text-neutral-900 dark:border-neutral-700 dark:text-white";

export default function CheckoutScreen() {
  const db = useDatabase();
  const session = useSession();
  const { refreshCounts, syncNow } = useSync();
  const { cart, customer, setQuantity, setPrice, remove, changeTier, chooseCustomer, clear } = useCart();
  const { shift } = useShift();
  /** Empty bottles handed over at the counter, per returnable product. */
  const [returned, setReturned] = useState<Record<string, number>>({});

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [editingPrice, setEditingPrice] = useState<{ key: string; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{ receiptNo: string; total: number; change: number } | null>(null);

  const totals = cartTotals(cart);
  const returnables = returnableLines(cart);
  const empties = depositsDue(returnables, new Map(Object.entries(returned)));
  const depositTotal = empties.reduce((sum, e) => sum + e.depositCharged, 0);
  /** What the customer pays: items plus deposits for bottles they keep. */
  const amountDue = totals.total + depositTotal;
  const drafts: DraftPayment[] = payments.map((row) => ({
    method: row.method,
    amount: toKes(row.amount),
    reference: row.reference.trim() || null,
  }));
  const check = checkPayments(amountDue, drafts, customer !== null);
  const cashChange = payments
    .filter((row) => row.method === "CASH" && row.tendered.trim() !== "")
    .reduce((sum, row) => sum + changeDue(toKes(row.tendered) || 0, toKes(row.amount) || 0), 0);
  const creditAmount = drafts.filter((d) => d.method === "CREDIT").reduce((sum, d) => sum + (d.amount || 0), 0);
  const overLimit =
    customer?.creditLimit != null && creditAmount > 0 && customer.balance + creditAmount > customer.creditLimit;

  function addPayment(method: PaymentMethod) {
    const remaining = Math.max(0, amountDue - drafts.reduce((sum, d) => sum + (d.amount || 0), 0));
    setPayments((rows) => [
      ...rows,
      { key: Crypto.randomUUID(), method, amount: remaining > 0 ? String(remaining) : "", reference: "", tendered: "" },
    ]);
  }

  function updatePayment(key: string, patch: Partial<PaymentRow>) {
    setPayments((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function commitPrice() {
    if (!editingPrice) return;
    const price = toKes(editingPrice.text);
    if (Number.isSafeInteger(price) && price >= 0) setPrice(editingPrice.key, price);
    setEditingPrice(null);
  }

  async function complete() {
    if (check.errors.length > 0 || submitting || !shift) return;
    setSubmitting(true);
    setError(null);
    try {
      const sale = await completeSale(db, {
        cart,
        payments: drafts,
        cashier: { id: session.user.id, name: session.user.name },
        customer: customer ? { id: customer.id, name: customer.name } : null,
        empties,
        deviceId: session.device.id,
        receiptPrefix: session.device.receiptPrefix,
      });
      setCompleted({ receiptNo: sale.receiptNo, total: amountDue, change: cashChange });
      clear();
      setReturned({});
      await refreshCounts();
      void syncNow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the sale.");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-lg text-neutral-500">Sale complete · {completed.receiptNo}</Text>
          <Text className="text-5xl font-bold text-neutral-900 dark:text-white">{formatKes(completed.total)}</Text>
          {completed.change > 0 && (
            <View className="mt-4 items-center rounded-2xl bg-amber-100 px-8 py-4 dark:bg-amber-950">
              <Text className="text-base text-amber-900 dark:text-amber-200">Give change</Text>
              <Text className="text-4xl font-bold text-amber-900 dark:text-amber-100">{formatKes(completed.change)}</Text>
            </View>
          )}
        </View>
        <View className="px-6 pb-8">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="h-14 items-center justify-center rounded-2xl bg-neutral-900 active:opacity-90 dark:bg-white"
          >
            <Text className="text-lg font-semibold text-white dark:text-neutral-900">New sale</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={["top", "left", "right"]}>
      <View className="flex-row items-center px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} accessibilityRole="button" className="py-2 pr-4">
          <Text className="text-base text-neutral-600 dark:text-neutral-400">‹ Back</Text>
        </Pressable>
        <Text className="flex-1 text-center text-lg font-semibold text-neutral-900 dark:text-white">Checkout</Text>
        <View className="w-16" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-5 px-4 pb-6" keyboardShouldPersistTaps="handled">
          {/* Customer and price tier */}
          <View className="gap-2">
            <Pressable
              onPress={() => router.push("/customers")}
              accessibilityRole="button"
              className="flex-row items-center justify-between rounded-xl border border-neutral-300 px-4 py-3 dark:border-neutral-700"
            >
              <View>
                <Text className="text-xs text-neutral-500">Customer</Text>
                <Text className="text-base font-medium text-neutral-900 dark:text-white">
                  {customer ? customer.name : "Walk-in customer"}
                </Text>
                {customer && customer.balance > 0 && (
                  <Text className="text-xs text-amber-700 dark:text-amber-400">Owes {formatKes(customer.balance)}</Text>
                )}
              </View>
              <Text className="text-sm text-neutral-500">{customer ? "Change" : "Choose"} ›</Text>
            </Pressable>
            {customer && (
              <Pressable onPress={() => void chooseCustomer(null)} accessibilityRole="button" className="self-start">
                <Text className="text-sm text-neutral-500 underline">Remove customer</Text>
              </Pressable>
            )}
            <View className="flex-row rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
              {PRICE_TIERS.map((tier) => {
                const selected = cart.priceTier === tier;
                return (
                  <Pressable
                    key={tier}
                    onPress={() => void changeTier(tier)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`flex-1 items-center rounded-lg py-2 ${selected ? "bg-white dark:bg-neutral-950" : ""}`}
                  >
                    <Text className={`text-sm font-medium ${selected ? "text-neutral-900 dark:text-white" : "text-neutral-500"}`}>
                      {tier === "RETAIL" ? "Retail prices" : "Wholesale prices"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Lines */}
          <View className="gap-1">
            {cart.lines.length === 0 && <Text className="py-6 text-center text-neutral-500">The cart is empty.</Text>}
            {cart.lines.map((line) => {
              const discounted = line.unitPrice !== line.listUnitPrice;
              return (
                <View key={line.key} className="gap-2 border-b border-neutral-100 py-3 dark:border-neutral-900">
                  <View className="flex-row items-start gap-2">
                    <Text className="flex-1 text-base font-medium text-neutral-900 dark:text-white">{line.name}</Text>
                    <Text className="text-base font-semibold text-neutral-900 dark:text-white">
                      {formatKes(line.unitPrice * line.quantity)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row items-center rounded-lg border border-neutral-300 dark:border-neutral-700">
                      <Pressable onPress={() => setQuantity(line.key, line.quantity - 1)} accessibilityLabel="Decrease quantity" className="px-4 py-2">
                        <Text className="text-lg text-neutral-900 dark:text-white">−</Text>
                      </Pressable>
                      <Text className="min-w-8 text-center text-base font-semibold text-neutral-900 dark:text-white">{line.quantity}</Text>
                      <Pressable onPress={() => setQuantity(line.key, line.quantity + 1)} accessibilityLabel="Increase quantity" className="px-4 py-2">
                        <Text className="text-lg text-neutral-900 dark:text-white">+</Text>
                      </Pressable>
                    </View>
                    {editingPrice?.key === line.key ? (
                      <TextInput
                        value={editingPrice.text}
                        onChangeText={(text) => setEditingPrice({ key: line.key, text })}
                        onSubmitEditing={commitPrice}
                        onBlur={commitPrice}
                        keyboardType="number-pad"
                        autoFocus
                        selectTextOnFocus
                        accessibilityLabel="Price each"
                        className={`${inputClass} w-28`}
                      />
                    ) : (
                      <Pressable
                        onPress={() => setEditingPrice({ key: line.key, text: String(line.unitPrice) })}
                        accessibilityRole="button"
                        accessibilityLabel="Change price"
                      >
                        <Text className="text-sm text-neutral-600 underline dark:text-neutral-400">
                          {formatKes(line.unitPrice)} each
                        </Text>
                        {discounted && (
                          <Text className="text-xs text-amber-700 dark:text-amber-400">list {formatKes(line.listUnitPrice)}</Text>
                        )}
                      </Pressable>
                    )}
                    <View className="flex-1" />
                    <Pressable onPress={() => remove(line.key)} accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`}>
                      <Text className="text-sm text-red-600">Remove</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Totals */}
          <View className="gap-1">
            {totals.discount !== 0 && (
              <>
                <View className="flex-row justify-between">
                  <Text className="text-neutral-500">Subtotal</Text>
                  <Text className="text-neutral-500">{formatKes(totals.subtotal)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-neutral-500">{totals.discount > 0 ? "Discount" : "Price increase"}</Text>
                  <Text className="text-neutral-500">{formatKes(-totals.discount)}</Text>
                </View>
              </>
            )}
            {depositTotal > 0 && (
              <View className="flex-row justify-between">
                <Text className="text-neutral-500">Bottle deposits (refundable)</Text>
                <Text className="text-neutral-500">{formatKes(depositTotal)}</Text>
              </View>
            )}
            <View className="flex-row justify-between">
              <Text className="text-xl font-bold text-neutral-900 dark:text-white">Total</Text>
              <Text className="text-xl font-bold text-neutral-900 dark:text-white">{formatKes(amountDue)}</Text>
            </View>
          </View>

          {/* Empties: returnable bottles are exchanged for empties or carry a deposit */}
          {returnables.length > 0 && (
            <View className="gap-2">
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">Empties</Text>
              {returnables.map((line) => {
                const due = empties.find((e) => e.productId === line.productId);
                const given = due?.returned ?? 0;
                const set = (value: number) =>
                  setReturned((current) => ({ ...current, [line.productId]: Math.min(line.bottles, Math.max(0, value)) }));
                return (
                  <View key={line.productId} className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                    <Text className="text-sm font-medium text-neutral-900 dark:text-white">
                      {line.name} · {line.bottles} bottle{line.bottles === 1 ? "" : "s"}
                    </Text>
                    <View className="flex-row items-center gap-3">
                      <Text className="text-sm text-neutral-600 dark:text-neutral-400">Empties brought</Text>
                      <View className="flex-row items-center rounded-lg border border-neutral-300 dark:border-neutral-700">
                        <Pressable onPress={() => set(given - 1)} accessibilityLabel="Fewer empties" className="px-4 py-2">
                          <Text className="text-lg text-neutral-900 dark:text-white">−</Text>
                        </Pressable>
                        <Text className="min-w-8 text-center text-base font-semibold text-neutral-900 dark:text-white">{given}</Text>
                        <Pressable onPress={() => set(given + 1)} accessibilityLabel="More empties" className="px-4 py-2">
                          <Text className="text-lg text-neutral-900 dark:text-white">+</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => set(line.bottles)} accessibilityRole="button">
                        <Text className="text-sm text-neutral-600 underline dark:text-neutral-400">All</Text>
                      </Pressable>
                    </View>
                    <Text className="text-xs text-neutral-500">
                      {due && due.depositCharged > 0
                        ? `Deposit ${formatKes(line.depositPerBottle)} × ${line.bottles - given} = ${formatKes(due.depositCharged)}`
                        : "No deposit — all bottles exchanged"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Payments */}
          <View className="gap-3">
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">Payment</Text>
            {payments.map((row) => (
              <View key={row.key} className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                <View className="flex-row items-center gap-2">
                  <Text className="w-16 text-base font-medium text-neutral-900 dark:text-white">{METHOD_LABEL[row.method]}</Text>
                  <TextInput
                    value={row.amount}
                    onChangeText={(amount) => updatePayment(row.key, { amount: amount.replace(/[^\d]/g, "") })}
                    keyboardType="number-pad"
                    placeholder="Amount"
                    accessibilityLabel={`${METHOD_LABEL[row.method]} amount`}
                    className={`${inputClass} flex-1`}
                    placeholderTextColor="#a3a3a3"
                  />
                  <Pressable
                    onPress={() => setPayments((rows) => rows.filter((r) => r.key !== row.key))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${METHOD_LABEL[row.method]} payment`}
                    className="px-2 py-2"
                  >
                    <Text className="text-lg text-neutral-500">✕</Text>
                  </Pressable>
                </View>
                {row.method === "MPESA" && (
                  <TextInput
                    value={row.reference}
                    onChangeText={(reference) => updatePayment(row.key, { reference: reference.toUpperCase() })}
                    autoCapitalize="characters"
                    placeholder="M-Pesa code, e.g. SJK2ABC123"
                    accessibilityLabel="M-Pesa confirmation code"
                    className={inputClass}
                    placeholderTextColor="#a3a3a3"
                  />
                )}
                {row.method === "CASH" && (
                  <TextInput
                    value={row.tendered}
                    onChangeText={(tendered) => updatePayment(row.key, { tendered: tendered.replace(/[^\d]/g, "") })}
                    keyboardType="number-pad"
                    placeholder="Cash received (optional, for change)"
                    accessibilityLabel="Cash received"
                    className={inputClass}
                    placeholderTextColor="#a3a3a3"
                  />
                )}
              </View>
            ))}
            <View className="flex-row gap-2">
              {PAYMENT_METHODS.map((method) => (
                <Pressable
                  key={method}
                  onPress={() => addPayment(method)}
                  accessibilityRole="button"
                  className="flex-1 items-center rounded-xl border border-neutral-300 py-3 active:bg-neutral-100 dark:border-neutral-700 dark:active:bg-neutral-900"
                >
                  <Text className="text-base font-medium text-neutral-900 dark:text-white">+ {METHOD_LABEL[method]}</Text>
                </Pressable>
              ))}
            </View>
            {cashChange > 0 && (
              <Text className="text-base font-semibold text-amber-700 dark:text-amber-400">Change due: {formatKes(cashChange)}</Text>
            )}
            {overLimit && customer && (
              <Text className="text-sm text-amber-700 dark:text-amber-400">
                This takes {customer.name} over their credit limit of {formatKes(customer.creditLimit ?? 0)}.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View className="gap-2 border-t border-neutral-200 px-4 pb-6 pt-3 dark:border-neutral-800">
        {payments.length > 0 &&
          check.errors.map((message) => (
            <Text key={message} className="text-sm text-red-600">
              {message}
            </Text>
          ))}
        {error && <Text className="text-sm text-red-600">{error}</Text>}
        {shift === null && (
          <Pressable onPress={() => router.push("/shift")} accessibilityRole="button" className="rounded-xl bg-amber-100 px-4 py-3 dark:bg-amber-950">
            <Text className="text-center text-sm font-medium text-amber-900 dark:text-amber-100">
              Open a shift before selling — tap here
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => void complete()}
          disabled={check.errors.length > 0 || submitting || !shift}
          accessibilityRole="button"
          className={`h-14 items-center justify-center rounded-2xl ${check.errors.length === 0 && !submitting && shift ? "bg-green-700 active:opacity-90" : "bg-neutral-300 dark:bg-neutral-700"}`}
        >
          <Text className="text-lg font-semibold text-white">
            {submitting ? "Saving…" : `Complete sale · ${formatKes(amountDue)}`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
