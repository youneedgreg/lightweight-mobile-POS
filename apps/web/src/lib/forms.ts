import { z } from "zod";

/** Result of a form Server Action, rendered by <FormStatus>. */
export interface FormState {
  ok: boolean;
  message: string | null;
}

export const initialFormState: FormState = { ok: false, message: null };

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

/** Optional text input: "" → null. */
export const optionalText = (max = 120) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());

/** Required whole-shilling / count input. */
export const wholeNumber = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.replace(/[,\s]/g, "") : value),
    z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} can't be negative`),
  );

/** Optional whole number: "" → null. */
export const optionalWholeNumber = (label: string) =>
  z.preprocess(
    (value) => blankToNull(typeof value === "string" ? value.replace(/[,\s]/g, "") : value),
    z.coerce.number().int(`${label} must be a whole number`).min(0, `${label} can't be negative`).nullable(),
  );

/** HTML checkbox: present ("on") = true, absent = false. */
export const checkbox = z.preprocess((value) => value === "on" || value === "true", z.boolean());

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "Invalid input";
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error ? isUniqueViolation(error.cause) : false;
}
