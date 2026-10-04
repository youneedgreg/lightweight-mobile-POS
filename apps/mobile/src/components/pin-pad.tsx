import { PIN_MAX_LENGTH } from "@liquor-pos/shared";
import { Pressable, Text, View } from "react-native";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Large on-screen number pad for PIN entry: fast for cashiers and never shows the digits. */
export function PinPad({ value, onChange, disabled = false }: PinPadProps) {
  function press(key: (typeof KEYS)[number]) {
    if (key === "clear") onChange("");
    else if (key === "back") onChange(value.slice(0, -1));
    else if (value.length < PIN_MAX_LENGTH) onChange(value + key);
  }

  return (
    <View className="gap-6">
      <View className="flex-row justify-center gap-3" accessibilityLabel={`${value.length} digits entered`}>
        {Array.from({ length: PIN_MAX_LENGTH }, (_, index) => (
          <View
            key={index}
            className={`h-4 w-4 rounded-full border-2 border-neutral-400 ${
              index < value.length ? "bg-neutral-900 dark:bg-white" : ""
            }`}
          />
        ))}
      </View>

      <View className="flex-row flex-wrap justify-center">
        {KEYS.map((key) => (
          <View key={key} className="w-1/3 p-1.5">
            <Pressable
              onPress={() => press(key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={key === "back" ? "Delete" : key === "clear" ? "Clear" : key}
              className="h-16 items-center justify-center rounded-2xl bg-neutral-100 active:bg-neutral-300 dark:bg-neutral-800 dark:active:bg-neutral-700"
            >
              <Text
                className={
                  key.length === 1
                    ? "text-2xl font-semibold text-neutral-900 dark:text-white"
                    : "text-base text-neutral-600 dark:text-neutral-300"
                }
              >
                {key === "back" ? "⌫" : key === "clear" ? "Clear" : key}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
