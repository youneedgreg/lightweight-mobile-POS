import { formatKes, productPrice, unitPrice, type PriceTier } from "@liquor-pos/shared";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Product, Unit } from "@/db/catalog-repo";

interface ProductRowProps {
  product: Product;
  tier: PriceTier;
  inCart: number;
  onAdd: (product: Product, unit: Unit | null) => void;
}

/** One sellable product: tap the row for a bottle, tap a pack chip below it for a whole pack. */
export const ProductRow = memo(function ProductRow({ product, tier, inCart, onAdd }: ProductRowProps) {
  const stockTone =
    product.stockOnHand <= 0 ? "text-red-600" : product.stockOnHand < 12 ? "text-amber-600" : "text-neutral-500";

  return (
    <View className="border-b border-neutral-100 dark:border-neutral-900">
      <Pressable
        onPress={() => onAdd(product, null)}
        accessibilityRole="button"
        accessibilityLabel={`Add ${product.name} ${product.size ?? ""}`}
        className={`flex-row items-center gap-3 px-4 pt-3 active:bg-neutral-100 dark:active:bg-neutral-900 ${product.units.length > 0 ? "pb-2" : "pb-3"}`}
      >
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-neutral-900 dark:text-white" numberOfLines={1}>
            {product.name}
            {product.size ? <Text className="font-normal text-neutral-500"> {product.size}</Text> : null}
          </Text>
          <Text className={`text-xs ${stockTone}`}>
            {product.stockOnHand <= 0 ? `Out of stock (${product.stockOnHand})` : `${product.stockOnHand} in stock`}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className="text-base font-semibold text-neutral-900 dark:text-white">
            {formatKes(productPrice(product, tier))}
          </Text>
          {inCart > 0 && (
            <View className="rounded-full bg-neutral-900 px-2 py-0.5 dark:bg-white">
              <Text className="text-xs font-semibold text-white dark:text-neutral-900">×{inCart}</Text>
            </View>
          )}
        </View>
      </Pressable>
      {product.units.length > 0 && (
        <View className="flex-row flex-wrap gap-2 px-4 pb-3">
          {product.units.map((unit) => (
            <Pressable
              key={unit.id}
              onPress={() => onAdd(product, unit)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${unit.name} of ${unit.unitsPerPack}`}
              className="rounded-full border border-neutral-300 px-3 py-1 active:bg-neutral-200 dark:border-neutral-700 dark:active:bg-neutral-800"
            >
              <Text className="text-xs text-neutral-700 dark:text-neutral-300">
                + {unit.name} ({unit.unitsPerPack}) · {formatKes(unitPrice(product, unit, tier))}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});
