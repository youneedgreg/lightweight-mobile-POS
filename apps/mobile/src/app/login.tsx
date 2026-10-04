import { normalizeKenyanPhone, PIN_MIN_LENGTH } from "@liquor-pos/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/auth-provider";
import { loadLastPhone } from "@/auth/session-storage";
import { PinPad } from "@/components/pin-pad";
import { ApiRequestError } from "@/lib/api";

/** "+254712345678" -> "0712 345 678" for display in the phone field. */
function toLocalFormat(phone: string): string {
  const local = `0${phone.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export default function LoginScreen() {
  const { state, signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(state.status === "signedOut" ? state.notice : null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadLastPhone().then((last) => {
      if (last) setPhone((current) => current || toLocalFormat(last));
    });
  }, []);

  const phoneValid = normalizeKenyanPhone(phone) !== null;
  const canSubmit = phoneValid && pin.length >= PIN_MIN_LENGTH && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(phone, pin);
    } catch (caught) {
      setPin("");
      if (caught instanceof ApiRequestError) {
        setError(
          caught.code === "NETWORK"
            ? "No internet connection. You need to be online to log in."
            : caught.message,
        );
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center gap-8 px-6 py-8" keyboardShouldPersistTaps="handled">
          <View className="gap-1">
            <Text className="text-3xl font-bold text-neutral-900 dark:text-white">Liquor POS</Text>
            <Text className="text-base text-neutral-500">Log in with your phone number and PIN</Text>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Phone number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="0712 345 678"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!submitting}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-lg text-neutral-900 dark:border-neutral-700 dark:text-white"
              placeholderTextColor="#a3a3a3"
            />
          </View>

          <View className="gap-3">
            <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">PIN</Text>
            <PinPad value={pin} onChange={setPin} disabled={submitting} />
          </View>

          {error && (
            <Text accessibilityRole="alert" className="text-center text-base text-red-600">
              {error}
            </Text>
          )}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            className={`h-14 items-center justify-center rounded-2xl ${canSubmit ? "bg-neutral-900 dark:bg-white" : "bg-neutral-300 dark:bg-neutral-700"}`}
          >
            {submitting ? (
              <ActivityIndicator color="#a3a3a3" />
            ) : (
              <Text className="text-lg font-semibold text-white dark:text-neutral-900">Log in</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
