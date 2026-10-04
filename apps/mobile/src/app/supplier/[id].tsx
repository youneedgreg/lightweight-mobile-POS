import { useLocalSearchParams } from "expo-router";

import { BalanceScreen } from "@/components/balance-screen";

export default function SupplierBalanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BalanceScreen party="supplier" id={id} />;
}
