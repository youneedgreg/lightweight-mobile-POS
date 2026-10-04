import { formatKes } from "@liquor-pos/shared";

import type { PaymentMix as PaymentMixRow } from "@/lib/reports";

const SERIES = {
  CASH: { label: "Cash", color: "var(--series-1)" },
  MPESA: { label: "M-Pesa", color: "var(--series-2)" },
  CREDIT: { label: "Credit (owed)", color: "var(--series-3)" },
} as const;

/**
 * How sales were paid: one stacked bar (2px surface gaps between segments)
 * with a legend that carries every value as text, so identity and amounts
 * never depend on color alone.
 */
export function PaymentMix({ rows }: { rows: PaymentMixRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.sales, 0);
  const repaid = rows.reduce((sum, r) => sum + r.debtRepayments, 0);

  return (
    <div className="flex flex-col gap-3">
      {total > 0 ? (
        <div className="flex h-3 gap-[2px] overflow-hidden rounded" role="img" aria-label="Payment mix">
          {rows
            .filter((r) => r.sales > 0)
            .map((r) => (
              <div key={r.method} style={{ width: `${(r.sales / total) * 100}%`, background: SERIES[r.method].color }} />
            ))}
        </div>
      ) : (
        <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-800" />
      )}
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.method} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[r.method].color }} aria-hidden />
            <span className="flex-1">{SERIES[r.method].label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatKes(r.sales)}</span>
            <span className="w-10 text-right text-neutral-500">{total > 0 ? `${Math.round((r.sales / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
      {repaid > 0 && (
        <p className="text-xs text-neutral-500">
          Plus {formatKes(repaid)} in debt repayments (
          {rows
            .filter((r) => r.debtRepayments > 0)
            .map((r) => `${SERIES[r.method].label} ${formatKes(r.debtRepayments)}`)
            .join(", ")}
          ).
        </p>
      )}
    </div>
  );
}
