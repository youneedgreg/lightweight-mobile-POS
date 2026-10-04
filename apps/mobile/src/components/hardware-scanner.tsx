import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";

/** Scanners type a whole code within a few ms per character; a pause this long ends the code. */
const IDLE_MS = 80;
/** Ignore stray keystrokes; real barcodes are longer. */
const MIN_LENGTH = 4;
/** How often to reclaim focus when nothing else is being typed into. */
const REFOCUS_MS = 500;

/** True when some other text field on screen has focus (the cashier is typing). */
function anotherInputFocused(own: TextInput | null): boolean {
  const state = TextInput.State as unknown as {
    currentlyFocusedInput?: () => unknown;
    currentlyFocusedField?: () => unknown;
  };
  const focused = state.currentlyFocusedInput?.() ?? state.currentlyFocusedField?.() ?? null;
  return focused !== null && focused !== undefined && focused !== own;
}

/**
 * Invisible capture field for Bluetooth / USB barcode scanners, which act as
 * keyboards: they "type" the code and usually press Enter. While the screen
 * is showing and no other field is being typed into, this field holds focus
 * without opening the on-screen keyboard, and hands each complete code to
 * `onScan`. Codes without a trailing Enter are detected by the typing pause.
 */
export function HardwareScanner({ onScan, enabled = true }: { onScan: (code: string) => void; enabled?: boolean }) {
  const screenFocused = useIsFocused();
  const active = enabled && screenFocused;
  const ref = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    (text: string) => {
      if (idle.current) clearTimeout(idle.current);
      idle.current = null;
      setValue("");
      const code = text.trim();
      if (code.length >= MIN_LENGTH) onScan(code);
    },
    [onScan],
  );

  useEffect(() => {
    if (!active) {
      ref.current?.blur();
      return;
    }
    const reclaim = () => {
      const input = ref.current;
      if (input && !input.isFocused() && !anotherInputFocused(input)) input.focus();
    };
    reclaim();
    const timer = setInterval(reclaim, REFOCUS_MS);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={(text) => {
        setValue(text);
        if (idle.current) clearTimeout(idle.current);
        idle.current = setTimeout(() => flush(text), IDLE_MS);
      }}
      onSubmitEditing={() => flush(value)}
      showSoftInputOnFocus={false}
      caretHidden
      autoCorrect={false}
      autoCapitalize="none"
      autoComplete="off"
      blurOnSubmit={false}
      editable={active}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 }}
    />
  );
}
