"use client";

import type { CustomerType, PriceTier } from "@liquor-pos/shared";
import { useActionState } from "react";

import { Button, Checkbox, Field, FormStatus, Input, inputClass } from "@/components/ui";
import { initialFormState } from "@/lib/forms";

import { saveCustomer, saveSupplier } from "./actions";

/** "+254712345678" → "0712345678" for editing. */
const localPhone = (phone: string | null) => (phone ? `0${phone.slice(4)}` : "");

export interface CustomerValues {
  id: string;
  name: string;
  phone: string | null;
  type: CustomerType;
  priceTier: PriceTier;
  creditLimit: number | null;
  notes: string | null;
  isActive: boolean;
}

export function CustomerForm({ customer }: { customer: CustomerValues | null }) {
  const [state, formAction, pending] = useActionState(saveCustomer, initialFormState);
  return (
    <form action={formAction} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={customer?.id ?? ""} />
      <Field label="Name">
        <Input name="name" required defaultValue={customer?.name} />
      </Field>
      <Field label="Phone">
        <Input name="phone" type="tel" placeholder="0712 345 678" defaultValue={localPhone(customer?.phone ?? null)} />
      </Field>
      <Field label="Type">
        <select name="type" defaultValue={customer?.type ?? "CUSTOMER"} className={inputClass}>
          <option value="CUSTOMER">Customer</option>
          <option value="PROMOTER">Promoter</option>
        </select>
      </Field>
      <Field label="Prices" hint="Wholesale customers get wholesale prices automatically at checkout.">
        <select name="priceTier" defaultValue={customer?.priceTier ?? "RETAIL"} className={inputClass}>
          <option value="RETAIL">Retail</option>
          <option value="WHOLESALE">Wholesale</option>
        </select>
      </Field>
      <Field label="Credit limit (KES)" hint="Cashiers are warned when a sale goes over it. Empty = no limit.">
        <Input name="creditLimit" inputMode="numeric" defaultValue={customer?.creditLimit ?? ""} />
      </Field>
      <Field label="Notes">
        <Input name="notes" defaultValue={customer?.notes ?? ""} />
      </Field>
      <div className="sm:col-span-2">
        <Checkbox name="isActive" label="Active" defaultChecked={customer?.isActive ?? true} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export interface SupplierValues {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
}

export function SupplierForm({ supplier }: { supplier: SupplierValues | null }) {
  const [state, formAction, pending] = useActionState(saveSupplier, initialFormState);
  return (
    <form action={formAction} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={supplier?.id ?? ""} />
      <Field label="Name">
        <Input name="name" required defaultValue={supplier?.name} />
      </Field>
      <Field label="Phone">
        <Input name="phone" type="tel" placeholder="0712 345 678" defaultValue={localPhone(supplier?.phone ?? null)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes">
          <Input name="notes" defaultValue={supplier?.notes ?? ""} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Checkbox name="isActive" label="Active" defaultChecked={supplier?.isActive ?? true} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
