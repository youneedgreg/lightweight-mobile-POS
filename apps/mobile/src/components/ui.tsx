import { router } from "expo-router";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type TextInputProps = ComponentPropsWithRef<typeof TextInput>;

export const inputClass =
  "rounded-xl border border-neutral-300 px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:text-white";

/** Back button + centred title, used by every secondary screen. */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center px-4 pb-2 pt-1">
      <Pressable onPress={() => router.back()} accessibilityRole="button" className="w-16 py-2">
        <Text className="text-base text-neutral-600 dark:text-neutral-400">‹ Back</Text>
      </Pressable>
      <Text className="flex-1 text-center text-lg font-semibold text-neutral-900 dark:text-white" numberOfLines={1}>
        {title}
      </Text>
      <View className="w-16 items-end">{right}</View>
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{children}</Text>;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor="#a3a3a3" {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

/** Whole-shilling input: keeps digits only. */
export function MoneyInput({ value, onChangeText, ...props }: TextInputProps & { value: string; onChangeText: (text: string) => void }) {
  return (
    <Input
      keyboardType="number-pad"
      {...props}
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/[^\d]/g, ""))}
    />
  );
}

/** Digits → whole shillings; NaN when empty. */
export const parseKes = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text.replace(/[^\d]/g, "")));

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  tone = "dark",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "dark" | "green" | "red";
}) {
  const color = disabled
    ? "bg-neutral-300 dark:bg-neutral-700"
    : tone === "green"
      ? "bg-green-700"
      : tone === "red"
        ? "bg-red-700"
        : "bg-neutral-900 dark:bg-white";
  const text = disabled || tone !== "dark" ? "text-white" : "text-white dark:text-neutral-900";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`h-14 items-center justify-center rounded-2xl active:opacity-90 ${color}`}
    >
      <Text className={`text-lg font-semibold ${text}`}>{title}</Text>
    </Pressable>
  );
}

/** Horizontal set of mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 items-center rounded-lg py-2 ${selected ? "bg-white dark:bg-neutral-950" : ""}`}
          >
            <Text className={`text-sm font-medium ${selected ? "text-neutral-900 dark:text-white" : "text-neutral-500"}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const NOTICE_BOX = {
  error: "bg-red-100 dark:bg-red-950",
  success: "bg-green-100 dark:bg-green-950",
  warning: "bg-amber-100 dark:bg-amber-950",
} as const;
const NOTICE_TEXT = {
  error: "text-red-800 dark:text-red-200",
  success: "text-green-800 dark:text-green-200",
  warning: "text-amber-900 dark:text-amber-100",
} as const;

export function Notice({ tone, children }: { tone: keyof typeof NOTICE_BOX; children: ReactNode }) {
  return (
    <View className={`rounded-lg px-3 py-2 ${NOTICE_BOX[tone]}`}>
      <Text className={`text-sm ${NOTICE_TEXT[tone]}`}>{children}</Text>
    </View>
  );
}
