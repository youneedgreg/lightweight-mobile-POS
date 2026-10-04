"use client";

import { useActionState } from "react";

import { Button, Checkbox, FormStatus, Input } from "@/components/ui";
import { initialFormState } from "@/lib/forms";

import { savePack } from "./actions";

export interface PackValues {
  id: string;
  name: string;
  barcode: string | null;
  unitsPerPack: number;
  retailPrice: number | null;
  wholesalePrice: number | null;
  isActive: boolean;
}

/** One row of the packs table: edit an existing pack, or add a new one when `pack` is null. */
export function PackForm({ productId, pack }: { productId: string; pack: PackValues | null }) {
  const [state, formAction, pending] = useActionState(savePack, initialFormState);

  return (
    <form action={formAction} className="grid grid-cols-2 items-end gap-2 border-b border-neutral-100 py-3 sm:grid-cols-[1fr_1.4fr_0.8fr_1fr_1fr_auto_auto] dark:border-neutral-900">
      <input type="hidden" name="id" value={pack?.id ?? ""} />
      <input type="hidden" name="productId" value={productId} />
      <Input name="name" aria-label="Pack name" placeholder="Crate" defaultValue={pack?.name} required />
      <Input name="barcode" aria-label="Pack barcode" placeholder="Pack barcode" defaultValue={pack?.barcode ?? ""} />
      <Input name="unitsPerPack" aria-label="Bottles per pack" placeholder="24" inputMode="numeric" defaultValue={pack?.unitsPerPack} required />
      <Input name="retailPrice" aria-label="Pack retail price" placeholder="Retail (auto)" inputMode="numeric" defaultValue={pack?.retailPrice ?? ""} />
      <Input name="wholesalePrice" aria-label="Pack wholesale price" placeholder="Wholesale (auto)" inputMode="numeric" defaultValue={pack?.wholesalePrice ?? ""} />
      <Checkbox name="isActive" label="Active" defaultChecked={pack?.isActive ?? true} />
      <Button type="submit" variant={pack ? "secondary" : "primary"} disabled={pending}>
        {pending ? "…" : pack ? "Save" : "Add pack"}
      </Button>
      <div className="col-span-full">
        <FormStatus state={state} />
      </div>
    </form>
  );
}
