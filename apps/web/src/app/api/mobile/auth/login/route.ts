import { mobileLoginRequestSchema, type MobileLoginResponse } from "@liquor-pos/shared";

import { verifyPhonePin } from "@/lib/auth/credentials";
import { signMobileToken } from "@/lib/auth/mobile-token";
import { registerDeviceLogin } from "@/lib/devices";
import { apiError, parseJsonBody } from "@/lib/http";

/** POS app login: phone + PIN on a specific device. Returns a bearer token bound to that device. */
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, mobileLoginRequestSchema);
  if ("response" in parsed) return parsed.response;
  const { phone, pin, deviceId, deviceLabel } = parsed.data;

  const result = await verifyPhonePin(phone, pin);
  if (!result.ok) {
    switch (result.code) {
      case "ACCOUNT_LOCKED":
        return apiError("ACCOUNT_LOCKED", "Too many wrong PINs. Try again in 15 minutes or ask the owner to reset your PIN.");
      case "ACCOUNT_DISABLED":
        return apiError("ACCOUNT_DISABLED", "This account is disabled. Ask the owner.");
      case "INVALID_CREDENTIALS":
        return apiError("INVALID_CREDENTIALS", "Wrong phone number or PIN.");
    }
  }

  const { user } = result;
  const device = await registerDeviceLogin(deviceId, deviceLabel, user.id);
  if (!device.isActive) {
    return apiError("DEVICE_DISABLED", "This phone has been disabled. Ask the owner.");
  }

  const { token, expiresAt } = await signMobileToken({
    userId: user.id,
    role: user.role,
    deviceId: device.id,
    tokenVersion: user.tokenVersion,
  });

  const body: MobileLoginResponse = {
    token,
    expiresAt: expiresAt.toISOString(),
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    device: { id: device.id, label: device.label, receiptPrefix: device.receiptPrefix },
  };
  return Response.json(body);
}
