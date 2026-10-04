import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { Input, Notice, ScreenHeader } from "@/components/ui";
import { searchProducts, type Product } from "@/db/catalog-repo";
import { useDatabase } from "@/db/database-provider";
import { API_URL } from "@/lib/config";
import { useSync } from "@/sync/sync-provider";

const MAX_WIDTH = 1000;

/** Shrinks and re-encodes a photo so uploads are small (a few hundred KB) on mobile data. */
async function prepare(uri: string): Promise<Blob> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: MAX_WIDTH }).renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return (await fetch(saved.uri)).blob();
}

/** Owner takes or picks a clear photo of a bottle; it shows in every phone's product list. Needs internet. */
export default function ProductPhotoScreen() {
  const db = useDatabase();
  const { token } = useSession();
  const { syncNow } = useSync();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void searchProducts(db, { query, limit: 60 }).then((rows) => {
      if (!cancelled) setProducts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [db, query, busyId]);

  async function capture(product: Product, source: "camera" | "library") {
    setMessage(null);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ tone: "error", text: "Permission is needed to add a photo." });
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 1 };
    const result =
      source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;

    setBusyId(product.id);
    try {
      const body = await prepare(asset.uri);
      const response = await fetch(`${API_URL}/api/admin/products/${product.id}/image`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
        body,
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(error?.error?.message ?? `Upload failed (${response.status}).`);
      }
      setMessage({ tone: "success", text: `Photo saved for ${product.name}.` });
      await syncNow(); // pulls the new image URL into the local catalog
    } catch (caught) {
      setMessage({
        tone: "error",
        text: caught instanceof TypeError ? "No internet connection. Photos need to be online." : caught instanceof Error ? caught.message : "Upload failed.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title="Bottle photos" />
      <View className="gap-2 px-4 pb-2">
        <Input value={query} onChangeText={setQuery} placeholder="Find a product" autoCorrect={false} />
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </View>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
            <View className="h-16 w-12 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={{ width: 48, height: 64 }} contentFit="contain" />
              ) : (
                <Text className="text-xs text-neutral-400">none</Text>
              )}
            </View>
            <Text className="flex-1 text-base text-neutral-900 dark:text-white" numberOfLines={2}>
              {item.name} {item.size ?? ""}
            </Text>
            {busyId === item.id ? (
              <Text className="text-sm text-neutral-500">Uploading…</Text>
            ) : (
              <View className="flex-row gap-2">
                <Pressable onPress={() => void capture(item, "camera")} disabled={busyId !== null} accessibilityRole="button" className="rounded-lg bg-neutral-900 px-3 py-2 dark:bg-white">
                  <Text className="text-sm font-medium text-white dark:text-neutral-900">Camera</Text>
                </Pressable>
                <Pressable onPress={() => void capture(item, "library")} disabled={busyId !== null} accessibilityRole="button" className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700">
                  <Text className="text-sm text-neutral-900 dark:text-white">Gallery</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
