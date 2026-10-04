import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth, useSession } from "@/auth/auth-provider";

export default function HomeScreen() {
  const { signOut } = useAuth();
  const { user, device } = useSession();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="gap-1">
          <Text className="text-sm text-neutral-500">Signed in as</Text>
          <Text className="text-3xl font-bold text-neutral-900 dark:text-white">{user.name ?? user.phone}</Text>
          <Text className="text-base text-neutral-500">
            {user.role === "ADMIN" ? "Owner" : "Cashier"} · {device.label} · Receipts {device.receiptPrefix}
          </Text>
        </View>

        <View className="items-center gap-2">
          <Text className="text-lg text-neutral-700 dark:text-neutral-300">Checkout arrives in Phase 3.</Text>
        </View>

        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          className="h-14 items-center justify-center rounded-2xl border border-neutral-300 dark:border-neutral-700"
        >
          <Text className="text-lg font-medium text-neutral-900 dark:text-white">Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
