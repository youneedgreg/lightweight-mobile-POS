import { formatKes, type PaymentMethod } from "@liquor-pos/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/auth-provider";
import { useDatabase } from "@/db/database-provider";
import { listRecentSales, type LocalSale, type SaleSyncStatus } from "@/db/sales-repo";
import { discardRejected, listRejected, type RejectedItem } from "@/sync/sync-engine";
import { useSync } from "@/sync/sync-provider";

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", MPESA: "M-Pesa", CREDIT: "Credit" };

const STATUS: Record<SaleSyncStatus, { label: string; className: string }> = {
  synced: { label: "Uploaded", className: "text-green-700" },
  pending: { label: "Waiting to upload", className: "text-amber-700 dark:text-amber-400" },
  rejected: { label: "Needs attention", className: "text-red-600" },
};

const timeFormat = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });

export default function SalesScreen() {
  const db = useDatabase();
  const { status, syncNow, retryRejected, refreshCounts } = useSync();
  const isOwner = useSession().user.role === "ADMIN";
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [rejected, setRejected] = useState<RejectedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listRecentSales(db), listRejected(db)]).then(([rows, problems]) => {
      if (cancelled) return;
      setSales(rows);
      setRejected(problems);
    });
    return () => {
      cancelled = true;
    };
  }, [db, status.pending, status.rejected, status.syncing]);

  const lastSynced = status.lastSyncedAt ? timeFormat.format(new Date(status.lastSyncedAt)) : "never";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <View className="flex-row items-center px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} accessibilityRole="button" className="py-2 pr-4">
          <Text className="text-base text-neutral-600 dark:text-neutral-400">‹ Back</Text>
        </Pressable>
        <Text className="flex-1 text-center text-lg font-semibold text-neutral-900 dark:text-white">Sales & sync</Text>
        <View className="w-16" />
      </View>

      <View className="mx-4 mb-3 gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
        <Text className="text-sm text-neutral-700 dark:text-neutral-300">
          {status.pending} waiting · {status.rejected} need attention · last sync {lastSynced}
        </Text>
        {status.lastError && <Text className="text-sm text-amber-700 dark:text-amber-400">{status.lastError}</Text>}
        <View className="flex-row gap-2">
          <Pressable onPress={() => void syncNow()} disabled={status.syncing} accessibilityRole="button" className="rounded-lg bg-neutral-900 px-4 py-2 dark:bg-white">
            <Text className="text-sm font-semibold text-white dark:text-neutral-900">{status.syncing ? "Syncing…" : "Sync now"}</Text>
          </Pressable>
          {status.rejected > 0 && (
            <Pressable onPress={() => void retryRejected()} accessibilityRole="button" className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700">
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">Retry rejected</Text>
            </Pressable>
          )}
        </View>
      </View>

      {rejected.length > 0 && (
        <View className="mx-4 mb-3 gap-2 rounded-xl border border-red-200 p-3 dark:border-red-900">
          <Text className="text-sm font-semibold text-red-700 dark:text-red-300">Needs attention</Text>
          {rejected.map((item) => (
            <View key={item.id} className="gap-0.5">
              <Text className="text-sm text-neutral-900 dark:text-white">{item.summary ?? item.kind}</Text>
              <Text className="text-xs text-red-600">{item.error ?? "Rejected by the server"}</Text>
              {isOwner && (
                <Pressable
                  onPress={() =>
                    void discardRejected(db, item.id).then(async () => {
                      setRejected((current) => current.filter((r) => r.id !== item.id));
                      await refreshCounts();
                    })
                  }
                  accessibilityRole="button"
                  className="self-start"
                >
                  <Text className="text-xs text-neutral-500 underline">Discard (owner)</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={sales}
        keyExtractor={(sale) => sale.id}
        renderItem={({ item }) => (
          <View className="gap-1 border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
            <View className="flex-row justify-between">
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">{item.receiptNo}</Text>
              <Text className="text-base font-semibold text-neutral-900 dark:text-white">{formatKes(item.total)}</Text>
            </View>
            <Text className="text-xs text-neutral-500">
              {timeFormat.format(new Date(item.occurredAt))} · {item.itemCount} item{item.itemCount === 1 ? "" : "s"} ·{" "}
              {item.paymentMethods.map((m) => METHOD_LABEL[m]).join(" + ")}
              {item.customerName ? ` · ${item.customerName}` : ""}
              {item.cashierName ? ` · by ${item.cashierName}` : ""}
            </Text>
            <Text className={`text-xs font-medium ${STATUS[item.syncStatus].className}`}>
              {STATUS[item.syncStatus].label}
              {item.syncError ? `: ${item.syncError}` : ""}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text className="px-6 py-12 text-center text-neutral-500">No sales yet.</Text>}
      />
    </SafeAreaView>
  );
}
