import { useLocalSearchParams } from "expo-router";

import { BalanceScreen } from "@/components/balance-screen";

export default function CustomerDebtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BalanceScreen party="customer" id={id} />;
}
