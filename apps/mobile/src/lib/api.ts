import { apiErrorSchema, type ApiErrorCode } from "@liquor-pos/shared";
import type { z } from "zod";

import { API_URL } from "./config";

const REQUEST_TIMEOUT_MS = 15_000;

/** NETWORK = no response (offline, timeout, DNS); BAD_RESPONSE = response didn't match the contract. */
export type ApiFailureCode = ApiErrorCode | "NETWORK" | "BAD_RESPONSE";

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiFailureCode,
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** True when the server rejected our credentials and the user must log in again. */
  get isAuthFailure(): boolean {
    return (
      this.code === "UNAUTHORIZED" ||
      this.code === "ACCOUNT_DISABLED" ||
      this.code === "DEVICE_DISABLED"
    );
  }
}

interface RequestOptions<S extends z.ZodType> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  /** Response body schema; the result is validated before it is returned. */
  schema: S;
}

/** Typed JSON request to the API. Throws ApiRequestError on any failure. */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  { method = "GET", body, token, schema }: RequestOptions<S>,
): Promise<z.output<S>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError("NETWORK", "No connection to the server.", null);
  } finally {
    clearTimeout(timeout);
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiRequestError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiRequestError("INTERNAL", `Server error (${response.status}).`, response.status);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiRequestError("BAD_RESPONSE", "Unexpected response from the server.", response.status);
  }
  return parsed.data;
}
