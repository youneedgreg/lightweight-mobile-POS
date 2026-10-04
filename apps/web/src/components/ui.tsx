import type { ComponentProps, ReactNode } from "react";

import type { FormState } from "@/lib/forms";

export const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200">
      <input type="checkbox" {...props} className="h-4 w-4" />
      {label}
    </label>
  );
}

export function Button({
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
      : "border border-neutral-300 text-neutral-900 dark:border-neutral-700 dark:text-white";
  return (
    <button
      {...props}
      className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function FormStatus({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
      {state.message}
    </p>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

