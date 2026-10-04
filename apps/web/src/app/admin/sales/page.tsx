import { formatKes } from "@liquor-pos/shared";
import type { Metadata } from "next";
import Link from "next/link";

import { RangePicker } from "@/components/range-picker";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { dateTimeFormat, resolveRange } from "@/lib/dates";
import { saleList } from "@/lib/reports";

export const metadata: Metadata = { title: "Sales · Liquor POS" };

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", MPESA: "M-Pesa", CREDIT: "Credit" };

export default async function SalesPage({ searchParams }: PageProps<"/admin/sales">) {
  await requireAdmin();
  const range = resolveRange(await searchParams);
  const rows = await saleList(range);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Sales · ${range.label}`} description={`${rows.length} receipt${rows.length === 1 ? "" : "s"}${rows.length >= 300 ? " (latest 300)" : ""}.`} />
      <RangePicker range={range} basePath="/admin/sales" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Receipt</th>
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Cashier</th>
              <th className="py-2 pr-4 font-medium">Paid by</th>
              <th className="py-2 pr-4 text-right font-medium">Total</th>
              <th className="py-2 text-right font-medium">Profit</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {rows.map((s) => (
              <tr key={s.id} className={`border-b border-neutral-100 dark:border-neutral-900 ${s.status === "VOIDED" ? "opacity-50" : ""}`}>
                <td className="py-2 pr-4">
                  <Link href={`/admin/sales/${s.id}`} className="font-medium hover:underline">
                    {s.receiptNo}
                  </Link>
                  {s.discountTotal > 0 && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">discount {formatKes(s.discountTotal)}</span>}
                </td>
                <td className="py-2 pr-4 text-neutral-500">{dateTimeFormat.format(s.occurredAt)}</td>
                <td className="py-2 pr-4">{s.cashier}</td>
                <td className="py-2 pr-4">{(s.methods ?? "").split(" + ").map((m) => METHOD_LABEL[m] ?? m).join(" + ")}</td>
                <td className="py-2 pr-4 text-right font-medium">
                  {formatKes(s.total)}
                  {s.depositTotal > 0 && <div className="text-xs font-normal text-neutral-500">+ {formatKes(s.depositTotal)} deposit</div>}
                </td>
                <td className="py-2 text-right text-neutral-500">{formatKes(s.grossProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">No sales in this period.</p>}
      </div>
    </div>
  );
}
