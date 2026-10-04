import { formatKes } from "@liquor-pos/shared";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { suppliersWithBalances } from "@/lib/ledgers";

export const metadata: Metadata = { title: "Suppliers · Liquor POS" };

export default async function SuppliersPage() {
  await requireAdmin();
  const rows = await suppliersWithBalances();
  const owed = rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Suppliers"
        description={`Money we owe: ${formatKes(owed)}`}
        actions={
          <Link href="/admin/suppliers/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            New supplier
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Supplier</th>
              <th className="py-2 text-right font-medium">We owe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={`border-b border-neutral-100 dark:border-neutral-900 ${s.isActive ? "" : "opacity-50"}`}>
                <td className="py-2 pr-4">
                  <Link href={`/admin/suppliers/${s.id}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  {s.phone && <div className="text-xs text-neutral-500">{s.phone}</div>}
                </td>
                <td className={`py-2 text-right font-medium ${s.balance > 0 ? "text-amber-700" : ""}`}>{formatKes(s.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
