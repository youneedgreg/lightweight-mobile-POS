import { formatKes } from "@liquor-pos/shared";
import { asc, eq, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { categories, products, productUnits } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Products · Liquor POS" };

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      size: products.size,
      barcode: products.barcode,
      category: categories.name,
      retailPrice: products.retailPrice,
      wholesalePrice: products.wholesalePrice,
      costPrice: products.costPrice,
      stockOnHand: products.stockOnHand,
      reorderLevel: products.reorderLevel,
      isActive: products.isActive,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(query ? or(ilike(products.name, `%${query}%`), eq(products.barcode, query)) : undefined)
    .orderBy(asc(products.name), asc(products.size));

  const packs = await db
    .select({ productId: productUnits.productId, name: productUnits.name, units: productUnits.unitsPerPack })
    .from(productUnits)
    .where(eq(productUnits.isActive, true));
  const packsByProduct = new Map<string, string[]>();
  for (const pack of packs) {
    packsByProduct.set(pack.productId, [...(packsByProduct.get(pack.productId) ?? []), `${pack.name} ×${pack.units}`]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description={`${rows.length} product${rows.length === 1 ? "" : "s"}. Prices and packs sync to phones automatically.`}
        actions={
          <Link href="/admin/products/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            New product
          </Link>
        }
      />
      <form className="max-w-md">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name or scan a barcode"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Product</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 text-right font-medium">Retail</th>
              <th className="py-2 pr-4 text-right font-medium">Wholesale</th>
              <th className="py-2 pr-4 text-right font-medium">Cost</th>
              <th className="py-2 pr-4 text-right font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const low = p.stockOnHand < p.reorderLevel;
              return (
                <tr key={p.id} className={`border-b border-neutral-100 dark:border-neutral-900 ${p.isActive ? "" : "opacity-50"}`}>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/products/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                      {p.name} {p.size && <span className="font-normal text-neutral-500">{p.size}</span>}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {[p.barcode, ...(packsByProduct.get(p.id) ?? []), p.imageUrl ? "📷" : null, p.isActive ? null : "inactive"]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{p.category ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">{formatKes(p.retailPrice)}</td>
                  <td className="py-2 pr-4 text-right">{p.wholesalePrice !== null ? formatKes(p.wholesalePrice) : "—"}</td>
                  <td className="py-2 pr-4 text-right text-neutral-500">{formatKes(p.costPrice)}</td>
                  <td className={`py-2 pr-4 text-right font-medium ${p.stockOnHand < 0 ? "text-red-600" : low ? "text-amber-600" : ""}`}>
                    {p.stockOnHand}
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
