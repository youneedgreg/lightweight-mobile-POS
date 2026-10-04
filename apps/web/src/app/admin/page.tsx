import { formatKes } from "@liquor-pos/shared";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PaymentMix } from "@/components/payment-mix";
import { RangePicker } from "@/components/range-picker";
import { SalesChart } from "@/components/sales-chart";
import { StatTile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth/dal";
import { dateTimeFormat, resolveRange } from "@/lib/dates";
import {
  balances,
  dailySales,
  openShifts,
  paymentMix,
  salesByCashier,
  shiftList,
  staleDevices,
  stockAlerts,
  summary,
  topProducts,
} from "@/lib/reports";

export const metadata: Metadata = { title: "Dashboard · Liquor POS" };

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const range = resolveRange(await searchParams);
  const query = range.preset ? `range=${range.preset}` : `from=${range.fromDay}&to=${range.toDay}`;

  const [totals, mix, daily, top, cashiers, money, stock, discrepancies, open, stale] = await Promise.all([
    summary(range),
    paymentMix(range),
    dailySales(range),
    topProducts(range),
    salesByCashier(range),
    balances(),
    stockAlerts(),
    shiftList(range, { onlyDiscrepancies: true, limit: 10 }),
    openShifts(),
    staleDevices(STALE_AFTER_MS),
  ]);

  const alertCount = stock.negative.length + discrepancies.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard · {range.label}</h1>
        <RangePicker range={range} basePath="/admin" />
      </div>

      {stale.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ⚠ Not synced in the last 2 hours: {stale.map((d) => `${d.label} (${d.receiptPrefix})`).join(", ")}. Their latest
          sales aren&apos;t in these numbers yet.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatKes(totals.revenue)}
          detail={`${totals.saleCount} sale${totals.saleCount === 1 ? "" : "s"}${totals.discounts > 0 ? ` · ${formatKes(totals.discounts)} discounts` : ""}`}
        />
        <StatTile label="Gross profit" value={formatKes(totals.grossProfit)} detail={`${percent(totals.grossProfit, totals.revenue)} margin`} />
        <StatTile
          label="Expenses"
          value={formatKes(totals.expenses)}
          detail={
            <Link href={`/admin/expenses?${query}`} className="underline">
              View expenses
            </Link>
          }
        />
        <StatTile label="Profit after expenses" value={formatKes(totals.net)} tone={totals.net < 0 ? "bad" : "default"} detail="Gross profit − expenses" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Owed to us"
          value={formatKes(money.owedToUs)}
          detail={
            <Link href="/admin/customers" className="underline">
              Customers
            </Link>
          }
        />
        <StatTile
          label="We owe suppliers"
          value={formatKes(money.weOwe)}
          detail={
            <Link href="/admin/suppliers" className="underline">
              Suppliers
            </Link>
          }
        />
        <StatTile label="Bottle deposits held" value={formatKes(money.depositsHeld)} detail="Refundable when empties come back" />
      </div>

      {alertCount > 0 && (
        <Card title={`Needs attention (${alertCount})`}>
          {stock.negative.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium text-red-700 dark:text-red-400">
                ⛔ Negative stock — more sold than recorded. Recount and adjust, or record the missing delivery.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {stock.negative.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/stock?q=${encodeURIComponent(p.name)}`} className="underline">
                      {p.name} {p.size}
                    </Link>{" "}
                    <span className="text-red-700 dark:text-red-400">{p.stockOnHand}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {discrepancies.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">⚠ Till didn&apos;t balance</p>
              <ul className="flex flex-col gap-0.5">
                {discrepancies.map((s) => (
                  <li key={s.id}>
                    {s.cashier} · {s.device} · {dateTimeFormat.format(s.openedAt)} ·{" "}
                    <span className={s.difference < 0 ? "text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-300"}>
                      {s.difference < 0 ? "short" : "over"} {formatKes(Math.abs(s.difference))}
                    </span>
                    {s.notes ? ` — “${s.notes}”` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Revenue by day">
            <SalesChart points={daily} />
          </Card>
        </div>
        <Card title="How customers paid">
          <PaymentMix rows={mix} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Top products"
          action={
            <Link href={`/admin/sales?${query}`} className="text-sm underline">
              All sales
            </Link>
          }
        >
          {top.length === 0 ? (
            <p className="text-sm text-neutral-500">No sales in this period.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 font-medium">Product</th>
                  <th className="py-1 text-right font-medium">Bottles</th>
                  <th className="py-1 text-right font-medium">Revenue</th>
                  <th className="py-1 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {top.map((p) => (
                  <tr key={p.productId} className="border-t border-neutral-100 dark:border-neutral-900">
                    <td className="py-1.5">
                      {p.name} <span className="text-neutral-500">{p.size}</span>
                    </td>
                    <td className="py-1.5 text-right">{p.bottles}</td>
                    <td className="py-1.5 text-right">{formatKes(p.revenue)}</td>
                    <td className="py-1.5 text-right">{formatKes(p.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Sales by cashier">
            {cashiers.length === 0 ? (
              <p className="text-sm text-neutral-500">No sales in this period.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                  {cashiers.map((c) => (
                    <tr key={c.cashierId} className="border-t border-neutral-100 first:border-0 dark:border-neutral-900">
                      <td className="py-1.5">{c.name ?? "—"}</td>
                      <td className="py-1.5 text-right text-neutral-500">{c.saleCount} sale{c.saleCount === 1 ? "" : "s"}</td>
                      <td className="py-1.5 text-right">{formatKes(c.revenue)}</td>
                      <td className="py-1.5 text-right text-neutral-500">{c.discounts > 0 ? `−${formatKes(c.discounts)} disc.` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title="Stock running low"
            action={
              <Link href="/admin/stock" className="text-sm underline">
                Stock
              </Link>
            }
          >
            {stock.low.length === 0 ? (
              <p className="text-sm text-neutral-500">Everything is above its reorder level.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {stock.low.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>
                      {p.name} <span className="text-neutral-500">{p.size}</span>
                    </span>
                    <span className="text-amber-800 dark:text-amber-300">
                      {p.stockOnHand} left · reorder at {p.reorderLevel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {open.length > 0 && (
            <Card
              title="Shifts open now"
              action={
                <Link href="/admin/shifts" className="text-sm underline">
                  Shifts
                </Link>
              }
            >
              <ul className="flex flex-col gap-1 text-sm">
                {open.map((s) => (
                  <li key={s.id}>
                    {s.cashier} · {s.device} · since {dateTimeFormat.format(s.openedAt)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
