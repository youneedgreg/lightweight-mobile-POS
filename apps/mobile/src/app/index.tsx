import { cartTotals, formatKes } from "@liquor-pos/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { ProductRow } from "@/components/product-row";
import { SyncBadge } from "@/components/sync-badge";
import {
  countProducts,
  findByBarcode,
  listCategories,
  searchProducts,
  type Category,
  type Product,
  type Unit,
} from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { useCart } from "@/pos/cart-provider";
import { useShift } from "@/pos/shift-provider";
import { useSync } from "@/sync/sync-provider";

export default function PosScreen() {
  const db = useDatabase();
  const { user } = useSession();
  const { shift } = useShift();
  const { status } = useSync();
  const { cart, add } = useCart();

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogSize, setCatalogSize] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ text: string; error: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<TextInput>(null);

  // Reload whenever the search changes or a sync brings new catalog data / stock levels.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      searchProducts(db, { query, categoryId }),
      listCategories(db),
      countProducts(db),
    ]).then(([found, cats, count]) => {
      if (cancelled) return;
      setProducts(found);
      setCategories(cats);
      setCatalogSize(count);
    });
    return () => {
      cancelled = true;
    };
  }, [db, query, categoryId, status.catalogVersion, status.pending]);

  const showFlash = useCallback((text: string, error = false) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ text, error });
    flashTimer.current = setTimeout(() => setFlash(null), 2000);
  }, []);

  const addToCart = useCallback(
    (product: Product, unit: Unit | null) => {
      add(product, unit);
      showFlash(`Added ${product.name}${unit ? ` (${unit.name})` : ""}`);
    },
    [add, showFlash],
  );

  /** Enter in the search box: an exact barcode adds the item (also how keyboard-wedge scanners work). */
  const submitSearch = useCallback(async () => {
    const term = query.trim();
    if (!term) return;
    const match = await findByBarcode(db, term);
    if (match) {
      addToCart(match.product, match.unit);
      setQuery("");
    } else if (products.length === 1 && products[0]) {
      addToCart(products[0], null);
      setQuery("");
    } else if (/^\d{6,}$/.test(term)) {
      showFlash(`No product with barcode ${term}`, true);
      setQuery("");
    }
    searchRef.current?.focus();
  }, [db, query, products, addToCart, showFlash]);

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart.lines) {
      if (!line.productUnitId) map.set(line.productId, line.quantity);
    }
    return map;
  }, [cart.lines]);

  const totals = cartTotals(cart);
  const firstName = (user.name ?? "").split(" ")[0] || "Cashier";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950" edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
        <Text className="flex-1 text-xl font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
          Hi, {firstName}
        </Text>
        <SyncBadge />
        <Pressable
          onPress={() => router.push("/menu")}
          accessibilityRole="button"
          className="rounded-full bg-neutral-100 px-3 py-1.5 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
        >
          <Text className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Menu</Text>
        </Pressable>
      </View>

      {shift === null && (
        <Pressable
          onPress={() => router.push("/shift")}
          accessibilityRole="button"
          className="mx-4 mb-2 rounded-xl bg-amber-100 px-4 py-3 active:opacity-80 dark:bg-amber-950"
        >
          <Text className="text-sm font-semibold text-amber-900 dark:text-amber-100">No shift open — tap to open one with your float</Text>
        </Pressable>
      )}

      <View className="flex-row gap-2 px-4 pb-2">
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void submitSearch()}
          placeholder="Search or type a barcode"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
          className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:text-white"
          placeholderTextColor="#a3a3a3"
        />
        <Pressable
          onPress={() => router.push("/scan")}
          accessibilityRole="button"
          accessibilityLabel="Scan barcode with camera"
          className="items-center justify-center rounded-xl bg-neutral-900 px-4 active:opacity-80 dark:bg-white"
        >
          <Text className="text-base font-semibold text-white dark:text-neutral-900">Scan</Text>
        </Pressable>
      </View>

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="items-center gap-2 px-4 pb-2">
          {[{ id: null, name: "All" }, ...categories].map((category) => {
            const selected = category.id === categoryId;
            return (
              <Pressable
                key={category.id ?? "all"}
                onPress={() => setCategoryId(category.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-full px-3 py-1.5 ${selected ? "bg-neutral-900 dark:bg-white" : "bg-neutral-100 dark:bg-neutral-800"}`}
              >
                <Text className={`text-sm ${selected ? "text-white dark:text-neutral-900" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {flash && (
        <View className={`mx-4 mb-2 rounded-lg px-3 py-2 ${flash.error ? "bg-red-100 dark:bg-red-950" : "bg-green-100 dark:bg-green-950"}`}>
          <Text className={`text-sm ${flash.error ? "text-red-800 dark:text-red-200" : "text-green-800 dark:text-green-200"}`}>
            {flash.text}
          </Text>
        </View>
      )}

      <FlatList
        data={products}
        keyExtractor={(product) => product.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ProductRow product={item} tier={cart.priceTier} inCart={quantities.get(item.id) ?? 0} onAdd={addToCart} />
        )}
        ListEmptyComponent={
          <View className="items-center gap-2 px-6 py-16">
            <Text className="text-center text-base text-neutral-500">
              {catalogSize === 0
                ? status.syncing
                  ? "Downloading products…"
                  : "No products on this phone yet. Connect to the internet to download the catalog."
                : "No products match your search."}
            </Text>
          </View>
        }
      />

      <View className="border-t border-neutral-200 px-4 pb-6 pt-3 dark:border-neutral-800">
        <Pressable
          onPress={() => router.push("/checkout")}
          disabled={cart.lines.length === 0}
          accessibilityRole="button"
          className={`h-14 flex-row items-center justify-between rounded-2xl px-5 ${cart.lines.length > 0 ? "bg-neutral-900 active:opacity-90 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"}`}
        >
          <Text className={`text-base font-medium ${cart.lines.length > 0 ? "text-white dark:text-neutral-900" : "text-neutral-500"}`}>
            {totals.itemCount === 0 ? "Cart is empty" : `${totals.itemCount} item${totals.itemCount === 1 ? "" : "s"}${cart.priceTier === "WHOLESALE" ? " · Wholesale" : ""}`}
          </Text>
          <Text className={`text-lg font-bold ${cart.lines.length > 0 ? "text-white dark:text-neutral-900" : "text-neutral-500"}`}>
            {cart.lines.length > 0 ? `Charge ${formatKes(totals.total)}` : ""}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
