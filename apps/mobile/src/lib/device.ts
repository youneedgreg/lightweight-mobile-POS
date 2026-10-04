import * as Crypto from "expo-crypto";
import * as Device from "expo-device";

import { secureStorage } from "@/lib/secure-storage";

const DEVICE_ID_KEY = "device.id";

let cachedDeviceId: string | null = null;

/**
 * Stable per-install identifier. Generated once and kept in secure storage, so
 * it survives app restarts but resets if the app is uninstalled (the phone then
 * registers as a new device with a new receipt prefix).
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await secureStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await secureStorage.setItem(DEVICE_ID_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

export function getDeviceLabel(): string {
  return (Device.deviceName ?? Device.modelName ?? "Unknown phone").slice(0, 64);
}
