import { formatKes } from "@liquor-pos/shared";

const dateFormat = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });

const LABELS: Record<string, string> = {
  CREDIT_SALE: "Credit sale",
  PAYMENT: "Payment",
  SALE_VOID: "Sale voided",
  ADJUSTMENT: "Adjustment",
  PURCHASE: "Delivery",
};

export interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  occurredAt: Date;
  by: string | null;
  reference?: string | null;
  method?: string | null;
}

/** Append-only ledger history. Positive amounts increase the balance owed. */
export function LedgerTable({ rows, emptyText }: { rows: LedgerRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{emptyText}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
          <tr>
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">What</th>
            <th className="py-2 pr-4 text-right font-medium">Amount</th>
            <th className="py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-4 text-neutral-500">{dateFormat.format(row.occurredAt)}</td>
              <td className="py-2 pr-4">{LABELS[row.type] ?? row.type}</td>
              <td className={`py-2 pr-4 text-right font-medium ${row.amount < 0 ? "text-green-700" : ""}`}>
                {row.amount > 0 ? "+" : ""}
                {formatKes(row.amount)}
              </td>
              <td className="py-2 text-neutral-500">
                {[row.method, row.reference, row.note, row.by && `by ${row.by}`].filter(Boolean).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
