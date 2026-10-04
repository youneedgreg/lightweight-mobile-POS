import { formatKes, type ExpenseCategory } from "@liquor-pos/shared";
import type { Metadata } from "next";

import { RangePicker } from "@/components/range-picker";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { dateTimeFormat, resolveRange } from "@/lib/dates";
import { expenseList } from "@/lib/reports";

export const metadata: Metadata = { title: "Expenses · Liquor POS" };

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  CASUAL_LABOUR: "Casual labour",
  TRANSPORT: "Transport",
  RENT: "Rent",
  UTILITIES: "Utilities",
  SUPPLIES: "Supplies",
  LICENSES: "Licences",
  OTHER: "Other",
};

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  await requireAdmin();
  const range = resolveRange(await searchParams);
  const rows = await expenseList(range);
  const total = rows.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of rows) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const categories = [...byCategory].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Expenses · ${range.label}`} description={`${formatKes(total)} in ${rows.length} expense${rows.length === 1 ? "" : "s"}. Recorded from the POS app.`} />
      <RangePicker range={range} basePath="/admin/expenses" />

      {categories.length > 0 && (
        <table className="w-full max-w-sm text-left text-sm">
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {categories.map(([category, amount]) => (
              <tr key={category} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-1.5">{CATEGORY_LABEL[category]}</td>
                <td className="py-1.5 text-right">{formatKes(amount)}</td>
                <td className="w-12 py-1.5 text-right text-neutral-500">{Math.round((amount / total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">What</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 font-medium">Paid</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4 text-neutral-500">{dateTimeFormat.format(e.occurredAt)}</td>
                <td className="py-2 pr-4">
                  {e.description} <span className="text-neutral-500">· {e.by}</span>
                </td>
                <td className="py-2 pr-4">{CATEGORY_LABEL[e.category]}</td>
                <td className="py-2 pr-4">{e.method === "CASH" ? "Cash (till)" : "M-Pesa"}</td>
                <td className="py-2 text-right font-medium">{formatKes(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">No expenses in this period.</p>}
      </div>
    </div>
  );
}
