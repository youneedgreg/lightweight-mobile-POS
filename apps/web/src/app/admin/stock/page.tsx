import { formatKes } from "@liquor-pos/shared";
import { and, asc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";

import { AdjustForm } from "./adjust-form";

export const metadata: Metadata = { title: "Stock · Liquor POS" };

const FILTERS = { all: "All", low: "Running low", negative: "Negative" } as const;
type Filter = keyof typeof FILTERS;

export default async function StockPage({ searchParams }: PageProps<"/admin/stock">) {
  await requireAdmin();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const filter: Filter = params.show === "low" || params.show === "negative" ? params.show : "all";

  const conditions: (SQL | undefined)[] = [eq(products.isActive, true)];
  if (query) conditions.push(or(ilike(products.name, `%${query}%`), eq(products.barcode, query)));
  if (filter === "negative") conditions.push(lt(products.stockOnHand, 0));
  if (filter === "low") conditions.push(and(gte(products.stockOnHand, 0), lt(products.stockOnHand, products.reorderLevel)));

  const [rows, [value]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        size: products.size,
        stockOnHand: products.stockOnHand,
        reorderLevel: products.reorderLevel,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.name), asc(products.size)),
    db
      .select({
        atCost: sql<number>`coalesce(sum(greatest(${products.stockOnHand}, 0) * ${products.costPrice}), 0)::int`,
        atRetail: sql<number>`coalesce(sum(greatest(${products.stockOnHand}, 0) * ${products.retailPrice}), 0)::int`,
      })
      .from(products)
      .where(eq(products.isActive, true)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        description={`On hand worth ${formatKes(value?.atCost ?? 0)} at cost · ${formatKes(value?.atRetail ?? 0)} at retail. Deliveries are received on the POS app; use this page for recounts and breakages.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={`/admin/stock?show=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            aria-current={filter === key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${filter === key ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}
          >
            {FILTERS[key]}
          </Link>
        ))}
        <form className="flex-1">
          <input type="hidden" name="show" value={filter} />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search or scan a barcode"
            className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Product</th>
              <th className="py-2 pr-4 text-right font-medium">In stock</th>
              <th className="py-2 pr-4 text-right font-medium">Reorder at</th>
              <th className="py-2 pr-4 text-right font-medium">Value at cost</th>
              <th className="py-2 font-medium">Adjust</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                <td className="py-2 pr-4">
                  <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                    {p.name} <span className="font-normal text-neutral-500">{p.size}</span>
                  </Link>
                </td>
                <td
                  className={`py-2 pr-4 text-right font-semibold ${p.stockOnHand < 0 ? "text-red-700 dark:text-red-400" : p.stockOnHand < p.reorderLevel ? "text-amber-700 dark:text-amber-400" : ""}`}
                >
                  {p.stockOnHand}
                </td>
                <td className="py-2 pr-4 text-right text-neutral-500">{p.reorderLevel}</td>
                <td className="py-2 pr-4 text-right text-neutral-500">{formatKes(Math.max(0, p.stockOnHand) * p.costPrice)}</td>
                <td className="py-2">
                  <AdjustForm productId={p.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">Nothing to show.</p>}
      </div>
    </div>
  );
}
