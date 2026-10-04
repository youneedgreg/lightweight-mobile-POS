import type { ReactNode } from "react";

/** A single headline number. Values use text ink, never a series color. */
export function StatTile({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  const valueTone = tone === "bad" ? "text-red-700 dark:text-red-400" : tone === "good" ? "text-green-700 dark:text-green-400" : "";
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className={`text-2xl font-semibold tracking-tight ${valueTone}`}>{value}</span>
      {detail && <span className="text-xs text-neutral-500">{detail}</span>}
    </div>
  );
}
