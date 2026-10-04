import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { findByBarcode } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { useCart } from "@/pos/cart-provider";

/** The camera reports the same code many times a second; ignore repeats for this long. */
const SAME_CODE_COOLDOWN_MS = 1500;

/** Continuous camera scanning: every recognised barcode goes straight into the cart. */
export default function ScanScreen() {
  const db = useDatabase();
  const { add, cart } = useCart();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const busy = useRef(false);

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      const now = Date.now();
      if (busy.current) return;
      if (last.current && last.current.code === data && now - last.current.at < SAME_CODE_COOLDOWN_MS) return;
      last.current = { code: data, at: now };
      busy.current = true;
      try {
        const match = await findByBarcode(db, data);
        if (match) {
          add(match.product, match.unit);
          setMessage({ text: `Added ${match.product.name}${match.unit ? ` (${match.unit.name})` : ""}`, error: false });
        } else {
          setMessage({ text: `Unknown barcode ${data}`, error: true });
        }
      } finally {
        busy.current = false;
      }
    },
    [db, add],
  );

  if (!permission) return <View className="flex-1 bg-black" />;

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-white px-6 dark:bg-neutral-950">
        <Text className="text-center text-base text-neutral-700 dark:text-neutral-300">
          The camera is used to scan bottle barcodes.
        </Text>
        <Pressable onPress={() => void requestPermission()} accessibilityRole="button" className="rounded-xl bg-neutral-900 px-6 py-3 dark:bg-white">
          <Text className="text-base font-semibold text-white dark:text-neutral-900">Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text className="text-base text-neutral-500">Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const items = cart.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
        onBarcodeScanned={(result) => void onScanned(result)}
      />
      <SafeAreaView className="absolute inset-0 justify-between" pointerEvents="box-none">
        <View className="items-center px-6 pt-4">
          <View className="h-40 w-full max-w-sm rounded-2xl border-2 border-white/80" />
          <Text className="mt-3 text-center text-sm text-white">Point at a barcode. Keep scanning — items add automatically.</Text>
        </View>
        <View className="gap-3 px-6 pb-8">
          {message && (
            <View className={`rounded-xl px-4 py-3 ${message.error ? "bg-red-600" : "bg-green-700"}`}>
              <Text className="text-center text-base font-medium text-white">{message.text}</Text>
            </View>
          )}
          <Pressable onPress={() => router.back()} accessibilityRole="button" className="h-14 items-center justify-center rounded-2xl bg-white">
            <Text className="text-lg font-semibold text-neutral-900">Done · {items} in cart</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
