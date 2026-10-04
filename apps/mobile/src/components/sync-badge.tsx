import { ActivityIndicator, Pressable, Text } from "react-native";

import { useSync } from "@/sync/sync-provider";

/** Compact sync state for the header. Tapping it syncs now. */
export function SyncBadge() {
  const { status, syncNow } = useSync();

  let label: string;
  let tone: string;
  if (status.syncing) {
    label = "Syncing";
    tone = "bg-blue-100 dark:bg-blue-950";
  } else if (status.rejected > 0) {
    label = `${status.rejected} need attention`;
    tone = "bg-red-100 dark:bg-red-950";
  } else if (status.lastError) {
    label = status.pending > 0 ? `Offline · ${status.pending} waiting` : "Offline";
    tone = "bg-amber-100 dark:bg-amber-950";
  } else if (status.pending > 0) {
    label = `${status.pending} waiting`;
    tone = "bg-amber-100 dark:bg-amber-950";
  } else {
    label = "Synced";
    tone = "bg-green-100 dark:bg-green-950";
  }

  return (
    <Pressable
      onPress={() => void syncNow()}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Tap to sync now.`}
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${tone}`}
    >
      {status.syncing && <ActivityIndicator size="small" />}
      <Text className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{label}</Text>
    </Pressable>
  );
}
