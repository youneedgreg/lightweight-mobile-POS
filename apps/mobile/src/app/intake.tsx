import { formatKes, MONEY_METHODS, type MoneyMethod } from "@liquor-pos/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { HardwareScanner } from "@/components/hardware-scanner";
import { Input, Label, MoneyInput, Notice, parseKes, PrimaryButton, ScreenHeader, Segmented } from "@/components/ui";
import { findByBarcode, listSuppliers, searchProducts, type Product, type Supplier, type Unit } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { recordIntake, type IntakeLine } from "@/db/money-repo";
import { listenForScans } from "@/pos/scan-bus";
import { useSync } from "@/sync/sync-provider";

interface Pending {
  product: Product;
  unit: Unit | null;
  quantity: string;
  unitCost: string;
}

const lineName = (product: Product, unit: Unit | null) =>
  `${product.name}${product.size ? ` ${product.size}` : ""}${unit ? ` (${unit.name} of ${unit.unitsPerPack})` : ""}`;

/** Owner receives a delivery. Packs are confirmed and broken into bottles. */
export default function IntakeScreen() {
  const db = useDatabase();
  const session = useSession();
  const { refreshCounts, syncNow } = useSync();
  const searchRef = useRef<TextInput>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [lines, setLines] = useState<(IntakeLine & { key: string })[]>([]);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<MoneyMethod>("CASH");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listSuppliers(db).then((rows) => {
      if (!cancelled) setSuppliers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    if (term.length < 2) return;
    void searchProducts(db, { query: term, limit: 8 }).then((rows) => {
      if (!cancelled) setResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db, query]);

  const choose = useCallback((product: Product, unit: Unit | null) => {
    setPending({ product, unit, quantity: "1", unitCost: product.costPrice !== null ? String(product.costPrice) : "" });
    setQuery("");
    setResults([]);
    setMessage(null);
  }, []);

  const handleBarcode = useCallback(
    async (code: string) => {
      const match = await findByBarcode(db, code);
      if (match) choose(match.product, match.unit);
      else setMessage({ tone: "error", text: `No product with barcode ${code}. Add it on the web dashboard first.` });
    },
    [db, choose],
  );

  // Barcodes from the camera scanner (opened with ?target=intake) land here.
  useEffect(() => listenForScans((code) => void handleBarcode(code)), [handleBarcode]);

  function confirmPending() {
    if (!pending) return;
    const quantity = parseKes(pending.quantity);
    const unitCost = parseKes(pending.unitCost);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(unitCost) || unitCost < 0) return;
    setLines((current) => [
      ...current,
      {
        key: `${pending.product.id}:${pending.unit?.id ?? "bottle"}:${Date.now()}`,
        productId: pending.product.id,
        productUnitId: pending.unit?.id ?? null,
        name: lineName(pending.product, pending.unit),
        quantity,
        unitsPerPack: pending.unit?.unitsPerPack ?? 1,
        unitCost,
      },
    ]);
    setPending(null);
    searchRef.current?.focus();
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitsPerPack * line.unitCost, 0);
  const paidValue = paid.trim() === "" ? (supplier ? 0 : total) : parseKes(paid);
  const paidValid = Number.isSafeInteger(paidValue) && paidValue >= 0 && paidValue <= total;
  const canSave =
    lines.length > 0 &&
    paidValid &&
    (supplier !== null || paidValue === total) &&
    (paidValue === 0 || method === "CASH" || reference.trim().length > 0);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await recordIntake(db, session, {
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        invoiceRef: invoiceRef.trim() || null,
        lines,
        amountPaid: paidValue,
        paymentMethod: paidValue > 0 ? method : null,
        paymentReference: method === "MPESA" ? reference.trim() || null : null,
      });
      const bottles = lines.reduce((sum, line) => sum + line.quantity * line.unitsPerPack, 0);
      setLines([]);
      setInvoiceRef("");
      setPaid("");
      setReference("");
      setMessage({ tone: "success", text: `Received ${bottles} bottles worth ${formatKes(total)}. Stock updated.` });
      await refreshCounts();
      void syncNow();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  const pendingQty = pending ? parseKes(pending.quantity) : 0;
  const pendingBottles = pending && Number.isSafeInteger(pendingQty) ? pendingQty * (pending.unit?.unitsPerPack ?? 1) : 0;

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title="Receive stock" />
      {/* Paused while a crate is being confirmed, so a second scan can't replace it. */}
      <HardwareScanner onScan={(code) => void handleBarcode(code)} enabled={pending === null} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <Label>Supplier</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {[null, ...suppliers].map((s) => {
                const selected = (s?.id ?? null) === (supplier?.id ?? null);
                return (
                  <Pressable
                    key={s?.id ?? "none"}
                    onPress={() => setSupplier(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`rounded-full px-3 py-1.5 ${selected ? "bg-neutral-900 dark:bg-white" : "bg-neutral-100 dark:bg-neutral-800"}`}
                  >
                    <Text className={`text-sm ${selected ? "text-white dark:text-neutral-900" : "text-neutral-700 dark:text-neutral-300"}`}>
                      {s ? s.name : "No supplier (paid in full)"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View className="gap-2">
            <Label>Scan or search items</Label>
            <View className="flex-row gap-2">
              <Input
                ref={searchRef}
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  if (text.trim().length < 2) setResults([]);
                }}
                onSubmitEditing={() => {
                  const code = query.trim();
                  if (code) void handleBarcode(code).then(() => setQuery(""));
                }}
                placeholder="Barcode or product name"
                autoCorrect={false}
                autoCapitalize="none"
                blurOnSubmit={false}
                className="flex-1"
              />
              <Pressable
                onPress={() => router.push({ pathname: "/scan", params: { target: "intake" } })}
                accessibilityRole="button"
                className="items-center justify-center rounded-xl bg-neutral-900 px-4 dark:bg-white"
              >
                <Text className="text-base font-semibold text-white dark:text-neutral-900">Scan</Text>
              </Pressable>
            </View>
            {results.map((product) => (
              <View key={product.id} className="gap-1 border-b border-neutral-100 py-2 dark:border-neutral-900">
                <Pressable onPress={() => choose(product, null)} accessibilityRole="button">
                  <Text className="text-base text-neutral-900 dark:text-white">{lineName(product, null)} · bottles</Text>
                </Pressable>
                {product.units.map((unit) => (
                  <Pressable key={unit.id} onPress={() => choose(product, unit)} accessibilityRole="button">
                    <Text className="text-sm text-neutral-600 underline dark:text-neutral-400">
                      + by the {unit.name.toLowerCase()} ({unit.unitsPerPack} bottles)
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          {pending && (
            <View className="gap-3 rounded-2xl border-2 border-neutral-900 p-4 dark:border-white">
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">{lineName(pending.product, pending.unit)}</Text>
              {pending.unit && (
                <Text className="text-sm text-neutral-700 dark:text-neutral-300">
                  Break into bottles? Each {pending.unit.name.toLowerCase()} adds {pending.unit.unitsPerPack} bottles to stock.
                </Text>
              )}
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                  <Label>{pending.unit ? `${pending.unit.name}s` : "Bottles"}</Label>
                  <MoneyInput value={pending.quantity} onChangeText={(quantity) => setPending({ ...pending, quantity })} selectTextOnFocus />
                </View>
                <View className="flex-1 gap-1">
                  <Label>Cost per bottle</Label>
                  <MoneyInput value={pending.unitCost} onChangeText={(unitCost) => setPending({ ...pending, unitCost })} placeholder="KES" />
                </View>
              </View>
              {pending.unit && pendingBottles > 0 && (
                <Text className="text-sm font-medium text-neutral-900 dark:text-white">= {pendingBottles} bottles into stock</Text>
              )}
              <View className="flex-row gap-2">
                <Pressable onPress={() => setPending(null)} accessibilityRole="button" className="flex-1 items-center rounded-xl border border-neutral-300 py-3 dark:border-neutral-700">
                  <Text className="text-base text-neutral-900 dark:text-white">Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmPending} accessibilityRole="button" className="flex-1 items-center rounded-xl bg-neutral-900 py-3 dark:bg-white">
                  <Text className="text-base font-semibold text-white dark:text-neutral-900">{pending.unit ? "Yes, add bottles" : "Add"}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {lines.length > 0 && (
            <View className="gap-1">
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">Delivery</Text>
              {lines.map((line) => (
                <View key={line.key} className="flex-row items-center gap-2 border-b border-neutral-100 py-2 dark:border-neutral-900">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-neutral-900 dark:text-white">{line.name}</Text>
                    <Text className="text-xs text-neutral-500">
                      {line.quantity} × {line.unitsPerPack > 1 ? `${line.unitsPerPack} = ${line.quantity * line.unitsPerPack} bottles` : "bottles"} @ {formatKes(line.unitCost)}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {formatKes(line.quantity * line.unitsPerPack * line.unitCost)}
                  </Text>
                  <Pressable onPress={() => setLines((current) => current.filter((l) => l.key !== line.key))} accessibilityLabel={`Remove ${line.name}`} className="px-2">
                    <Text className="text-lg text-neutral-500">✕</Text>
                  </Pressable>
                </View>
              ))}
              <View className="flex-row justify-between pt-1">
                <Text className="text-lg font-bold text-neutral-900 dark:text-white">Total</Text>
                <Text className="text-lg font-bold text-neutral-900 dark:text-white">{formatKes(total)}</Text>
              </View>
            </View>
          )}

          {lines.length > 0 && (
            <View className="gap-3">
              <View className="gap-1">
                <Label>Invoice / delivery note (optional)</Label>
                <Input value={invoiceRef} onChangeText={setInvoiceRef} placeholder="e.g. INV-1043" />
              </View>
              <View className="gap-1">
                <Label>Paid now (KES)</Label>
                <MoneyInput value={paid} onChangeText={setPaid} placeholder={supplier ? "0 — all on credit" : String(total)} />
                {supplier && paidValid && paidValue < total && (
                  <Text className="text-xs text-amber-700 dark:text-amber-400">
                    {formatKes(total - paidValue)} will be added to what we owe {supplier.name}.
                  </Text>
                )}
                {!supplier && paidValid && paidValue !== total && (
                  <Text className="text-xs text-red-600">Pick a supplier if you aren&apos;t paying the full amount now.</Text>
                )}
              </View>
              {paidValue > 0 && (
                <>
                  <Segmented options={MONEY_METHODS.map((m) => ({ value: m, label: m === "CASH" ? "Cash from till" : "M-Pesa" }))} value={method} onChange={setMethod} />
                  {method === "MPESA" && (
                    <Input value={reference} onChangeText={(t) => setReference(t.toUpperCase())} autoCapitalize="characters" placeholder="M-Pesa code" />
                  )}
                </>
              )}
            </View>
          )}

          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          {lines.length > 0 && (
            <PrimaryButton title={busy ? "Saving…" : `Receive stock · ${formatKes(total)}`} tone="green" disabled={!canSave || busy} onPress={() => void save()} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
