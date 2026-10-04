"use client";

import { useActionState, useState } from "react";

import { Button, Checkbox, Field, FormStatus, Input, inputClass } from "@/components/ui";
import { initialFormState } from "@/lib/forms";

import { saveProduct } from "./actions";

export interface ProductFormValues {
  id: string | null;
  name: string;
  size: string | null;
  barcode: string | null;
  categoryId: string | null;
  retailPrice: number;
  wholesalePrice: number | null;
  reorderLevel: number;
  isReturnable: boolean;
  depositAmount: number;
  isActive: boolean;
}

export function ProductForm({
  product,
  categories,
}: {
  product: ProductFormValues | null;
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveProduct, initialFormState);
  const [returnable, setReturnable] = useState(product?.isReturnable ?? false);
  const isNew = product === null;

  return (
    <form action={formAction} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <Field label="Name">
        <Input name="name" required defaultValue={product?.name} placeholder="Tusker Lager" />
      </Field>
      <Field label="Size" hint="e.g. 500ml, 750ml, 1L">
        <Input name="size" defaultValue={product?.size ?? ""} />
      </Field>
      <Field label="Bottle barcode" hint="Scan it into this box with a USB/Bluetooth scanner, or type it.">
        <Input name="barcode" defaultValue={product?.barcode ?? ""} inputMode="numeric" />
      </Field>
      <Field label="Category">
        <select name="categoryId" defaultValue={product?.categoryId ?? ""} className={inputClass}>
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="…or new category">
        <Input name="newCategory" placeholder="e.g. Whisky" />
      </Field>
      <Field label="Reorder level (bottles)" hint="Dashboard warns when stock falls below this.">
        <Input name="reorderLevel" inputMode="numeric" defaultValue={product?.reorderLevel ?? 12} required />
      </Field>
      <Field label="Retail price per bottle (KES)">
        <Input name="retailPrice" inputMode="numeric" defaultValue={product?.retailPrice} required />
      </Field>
      <Field label="Wholesale price per bottle (KES)" hint="Leave empty to use the retail price.">
        <Input name="wholesalePrice" inputMode="numeric" defaultValue={product?.wholesalePrice ?? ""} />
      </Field>

      {isNew && (
        <>
          <Field label="Cost per bottle (KES)" hint="Updated automatically by every stock intake.">
            <Input name="costPrice" inputMode="numeric" />
          </Field>
          <Field label="Opening stock (bottles)" hint="Bottles on the shelf right now.">
            <Input name="openingStock" inputMode="numeric" />
          </Field>
        </>
      )}

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Checkbox
          name="isReturnable"
          label="Returnable bottle (customers pay a deposit unless they bring an empty)"
          checked={returnable}
          onChange={(event) => setReturnable(event.target.checked)}
        />
        {returnable && (
          <div className="max-w-xs">
            <Field label="Deposit per bottle (KES)">
              <Input name="depositAmount" inputMode="numeric" defaultValue={product?.depositAmount || ""} required />
            </Field>
          </div>
        )}
        {!returnable && <input type="hidden" name="depositAmount" value="0" />}
        <Checkbox name="isActive" label="Available for sale" defaultChecked={product?.isActive ?? true} />
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
