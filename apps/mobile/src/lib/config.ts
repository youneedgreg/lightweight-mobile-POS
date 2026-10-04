/**
 * Base URL of the Next.js API. Override with EXPO_PUBLIC_API_URL in
 * apps/mobile/.env.local (e.g. http://192.168.1.20:3000 to hit a local server).
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://liquor-pos-murex.vercel.app"
).replace(/\/+$/, "");
