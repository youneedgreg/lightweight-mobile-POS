/**
 * Web has no secure enclave; expo-secure-store is native-only. This fallback
 * exists so the app can be previewed in a browser during development. The POS
 * is shipped to Android only.
 */
export const secureStorage = {
  getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage?.removeItem(key),
};
