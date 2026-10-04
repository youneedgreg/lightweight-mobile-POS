"use client";

import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@liquor-pos/shared";
import { useActionState } from "react";

import { createCashier, resetPin, setPhone, type FormState } from "./actions";

const initialState: FormState = { ok: false, message: null };

const inputClass =
  "rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900";

const pinInputProps = {
  name: "pin",
  type: "password",
  inputMode: "numeric",
  pattern: `\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}`,
  minLength: PIN_MIN_LENGTH,
  maxLength: PIN_MAX_LENGTH,
  autoComplete: "new-password",
  required: true,
} as const;

function StatusMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
      {state.message}
    </p>
  );
}

export function CreateCashierForm() {
  const [state, formAction, pending] = useActionState(createCashier, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <input name="name" required maxLength={80} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Phone
        <input name="phone" type="tel" placeholder="0712 345 678" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        PIN ({PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} digits)
        <input {...pinInputProps} className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Adding…" : "Add cashier"}
      </button>
      <div className="basis-full">
        <StatusMessage state={state} />
      </div>
    </form>
  );
}

export function ResetPinForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(resetPin, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input {...pinInputProps} placeholder="New PIN" aria-label="New PIN" className={`${inputClass} w-28 py-1 text-sm`} />
        <button type="submit" disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
          {pending ? "Saving…" : "Set PIN"}
        </button>
      </div>
      <StatusMessage state={state} />
    </form>
  );
}

export function PhoneForm({ userId, phone }: { userId: string; phone: string | null }) {
  const [state, formAction, pending] = useActionState(setPhone, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input
          name="phone"
          type="tel"
          required
          defaultValue={phone ? `0${phone.slice(4)}` : ""}
          placeholder="Phone for POS login"
          aria-label="Phone for POS login"
          className={`${inputClass} w-40 py-1 text-sm`}
        />
        <button type="submit" disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <StatusMessage state={state} />
    </form>
  );
}
