"use client";

import { useActionState, useState } from "react";

import { FormStatus } from "@/components/ui";
import { initialFormState } from "@/lib/forms";

import { adjustStock } from "./actions";
import { ADJUSTMENT_REASONS } from "./reasons";

const control = "rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/** Inline stock correction for one product row. */
export function AdjustForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(adjustStock, initialFormState);
  const [mode, setMode] = useState<"count" | "change">("count");

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="productId" value={productId} />
        <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as "count" | "change")} aria-label="Adjustment type" className={control}>
          <option value="count">Counted</option>
          <option value="change">Add / remove</option>
        </select>
        <input
          name="value"
          inputMode="numeric"
          required
          placeholder={mode === "count" ? "On shelf" : "e.g. -2"}
          aria-label={mode === "count" ? "Bottles counted" : "Bottles to add or remove"}
          className={`${control} w-24`}
        />
        <select name="reason" defaultValue={mode === "count" ? "Recount" : "Breakage"} key={mode} aria-label="Reason" className={control}>
          {ADJUSTMENT_REASONS.map((reason) => (
            <option key={reason}>{reason}</option>
          ))}
        </select>
        <input name="note" placeholder="Note" aria-label="Note" className={`${control} w-28`} />
        <button type="submit" disabled={pending} className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700">
          {pending ? "…" : "Save"}
        </button>
      </div>
      <FormStatus state={state} />
    </form>
  );
}
