import { router, type Href } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth, useSession } from "@/auth/auth-provider";
import { ScreenHeader } from "@/components/ui";
import { useShift } from "@/pos/shift-provider";
import { useSync } from "@/sync/sync-provider";

interface Item {
  href: Href;
  title: string;
  description: string;
  ownerOnly?: boolean;
}

const ITEMS: Item[] = [
  { href: "/shift", title: "Shift & till", description: "Open with a float, close with a cash count" },
  { href: "/sales", title: "Sales & sync", description: "Receipts on this phone and upload status" },
  { href: "/debts", title: "Customer debts", description: "Record payments of money owed to us" },
  { href: "/expenses", title: "Expenses", description: "Casual labour, transport and other costs" },
  { href: "/empties", title: "Return empties", description: "Refund deposits for bottles brought back" },
  { href: "/intake", title: "Receive stock", description: "Deliveries, crates into bottles, supplier bills", ownerOnly: true },
  { href: "/suppliers", title: "Suppliers", description: "Money we owe and payments to suppliers", ownerOnly: true },
  { href: "/product-photo", title: "Bottle photos", description: "Take photos for the product list", ownerOnly: true },
];

export default function MenuScreen() {
  const { signOut } = useAuth();
  const { user, device } = useSession();
  const { shift } = useShift();
  const { status } = useSync();
  const isOwner = user.role === "ADMIN";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <ScreenHeader title="Menu" />
      <ScrollView contentContainerClassName="gap-2 px-4 pb-8">
        <View className="mb-2 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
          <Text className="text-base font-semibold text-neutral-900 dark:text-white">{user.name ?? user.phone}</Text>
          <Text className="text-sm text-neutral-500">
            {isOwner ? "Owner" : "Cashier"} · {device.label} · receipts {device.receiptPrefix}
          </Text>
          <Text className="mt-1 text-sm text-neutral-500">
            {shift ? `Shift open since ${new Date(shift.openedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}` : "No shift open"}
            {status.pending > 0 ? ` · ${status.pending} waiting to upload` : ""}
          </Text>
        </View>

        {ITEMS.filter((item) => isOwner || !item.ownerOnly).map((item) => (
          <Pressable
            key={item.title}
            onPress={() => router.push(item.href)}
            accessibilityRole="button"
            className="rounded-xl border border-neutral-200 px-4 py-3 active:bg-neutral-100 dark:border-neutral-800 dark:active:bg-neutral-900"
          >
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              {item.title}
              {item.ownerOnly ? <Text className="text-xs font-normal text-neutral-500">  owner</Text> : null}
            </Text>
            <Text className="text-sm text-neutral-500">{item.description}</Text>
          </Pressable>
        ))}

        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          className="mt-4 items-center rounded-xl border border-neutral-300 py-3 dark:border-neutral-700"
        >
          <Text className="text-base font-medium text-neutral-900 dark:text-white">Log out</Text>
        </Pressable>
        <Text className="text-center text-xs text-neutral-400">
          Logging out keeps the shift open and everything waiting to upload on this phone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
