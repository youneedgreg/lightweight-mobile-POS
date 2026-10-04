import { formatKes } from "@liquor-pos/shared";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { customersWithBalances } from "@/lib/ledgers";

export const metadata: Metadata = { title: "Customers · Liquor POS" };

export default async function CustomersPage() {
  await requireAdmin();
  const rows = await customersWithBalances();
  const owed = rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description={`Money owed to us: ${formatKes(owed)}`}
        actions={
          <Link href="/admin/customers/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            New customer
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Customer</th>
              <th className="py-2 pr-4 font-medium">Prices</th>
              <th className="py-2 pr-4 text-right font-medium">Credit limit</th>
              <th className="py-2 text-right font-medium">Owes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const over = c.creditLimit !== null && c.balance > c.creditLimit;
              return (
                <tr key={c.id} className={`border-b border-neutral-100 dark:border-neutral-900 ${c.isActive ? "" : "opacity-50"}`}>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {[c.phone, c.type === "PROMOTER" ? "Promoter" : null].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="py-2 pr-4">{c.priceTier === "WHOLESALE" ? "Wholesale" : "Retail"}</td>
                  <td className="py-2 pr-4 text-right">{c.creditLimit !== null ? formatKes(c.creditLimit) : "—"}</td>
                  <td className={`py-2 text-right font-medium ${over ? "text-red-600" : c.balance > 0 ? "text-amber-700" : ""}`}>
                    {formatKes(c.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
