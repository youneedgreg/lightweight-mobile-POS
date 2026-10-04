import type { ApiError, ApiErrorCode } from "@liquor-pos/shared";
import type { z } from "zod";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  ACCOUNT_DISABLED: 403,
  DEVICE_DISABLED: 403,
  NOT_FOUND: 404,
  ACCOUNT_LOCKED: 423,
  INTERNAL: 500,
};

/** JSON error in the shape every client expects: `{ error: { code, message } }`. */
export function apiError(code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status: STATUS[code] });
}

/** Parses a JSON request body against a schema, returning a 400 response on failure. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: Response }> {
  const body: unknown = await request.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request body";
    return { response: apiError("BAD_REQUEST", message) };
  }
  return { data: result.data };
}
