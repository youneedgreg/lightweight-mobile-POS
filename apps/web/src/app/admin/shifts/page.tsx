import { formatKes } from "@liquor-pos/shared";
import type { Metadata } from "next";

import { RangePicker } from "@/components/range-picker";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { dateTimeFormat, resolveRange } from "@/lib/dates";
import { shiftList } from "@/lib/reports";

export const metadata: Metadata = { title: "Shifts · Liquor POS" };

export default async function ShiftsPage({ searchParams }: PageProps<"/admin/shifts">) {
  await requireAdmin();
  const range = resolveRange(await searchParams);
  const rows = await shiftList(range);
  const closed = rows.filter((s) => s.status === "CLOSED");
  const net = closed.reduce((sum, s) => sum + (s.difference ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Shifts · ${range.label}`}
        description={`${rows.length} shift${rows.length === 1 ? "" : "s"} · net till difference ${net === 0 ? "none" : `${net < 0 ? "short" : "over"} ${formatKes(Math.abs(net))}`}`}
      />
      <RangePicker range={range} basePath="/admin/shifts" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Opened</th>
              <th className="py-2 pr-4 font-medium">Cashier · phone</th>
              <th className="py-2 pr-4 text-right font-medium">Float</th>
              <th className="py-2 pr-4 text-right font-medium">Expected</th>
              <th className="py-2 pr-4 text-right font-medium">Counted</th>
              <th className="py-2 pr-4 text-right font-medium">Difference</th>
              <th className="py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-4">
                  {dateTimeFormat.format(s.openedAt)}
                  <div className="text-xs text-neutral-500">
                    {s.status === "OPEN" ? "Still open" : s.closedAt ? `Closed ${dateTimeFormat.format(s.closedAt)}` : ""}
                  </div>
                </td>
                <td className="py-2 pr-4">
                  {s.cashier} <span className="text-neutral-500">· {s.device}</span>
                </td>
                <td className="py-2 pr-4 text-right">{formatKes(s.openingFloat)}</td>
                <td className="py-2 pr-4 text-right">{s.expectedCash !== null ? formatKes(s.expectedCash) : "—"}</td>
                <td className="py-2 pr-4 text-right">{s.countedCash !== null ? formatKes(s.countedCash) : "—"}</td>
                <td
                  className={`py-2 pr-4 text-right font-medium ${s.status !== "CLOSED" ? "" : s.difference < 0 ? "text-red-700 dark:text-red-400" : s.difference > 0 ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}
                >
                  {s.status !== "CLOSED" ? "—" : s.difference === 0 ? "✓ Balanced" : `${s.difference < 0 ? "Short" : "Over"} ${formatKes(Math.abs(s.difference))}`}
                </td>
                <td className="py-2 text-neutral-500">{s.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">No shifts in this period.</p>}
      </div>
    </div>
  );
}
