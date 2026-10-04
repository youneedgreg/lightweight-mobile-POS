import { formatKes } from "@liquor-pos/shared";
import { asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { categories, productUnits, products, stockMovements, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";

import { ImageUpload } from "../image-upload";
import { PackForm } from "../pack-form";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Product · Liquor POS" };

const dateFormat = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });
const MOVEMENT_LABEL: Record<string, string> = {
  SALE: "Sold",
  SALE_VOID: "Sale voided",
  INTAKE: "Received",
  CASE_BREAK_OUT: "Case broken",
  CASE_BREAK_IN: "From case",
  ADJUSTMENT: "Adjustment",
};

export default async function ProductPage({ params }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) notFound();

  const [categoryRows, packs, movements] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(productUnits).where(eq(productUnits.productId, id)).orderBy(asc(productUnits.unitsPerPack)),
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        occurredAt: stockMovements.occurredAt,
        by: users.name,
      })
      .from(stockMovements)
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(eq(stockMovements.productId, id))
      .orderBy(desc(stockMovements.occurredAt))
      .limit(20),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/products" className="text-sm text-neutral-500">
          ‹ Products
        </Link>
        <PageHeader
          title={`${product.name}${product.size ? ` ${product.size}` : ""}`}
          description={`${product.stockOnHand} bottles in stock · cost ${formatKes(product.costPrice)} per bottle`}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Photo</h2>
        <ImageUpload productId={product.id} imageUrl={product.imageUrl} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Details and prices</h2>
        <ProductForm product={product} categories={categoryRows} />
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Crates and cartons</h2>
        <p className="text-sm text-neutral-500">
          Scanning a pack barcode sells the whole pack, or receives it as that many bottles. Leave pack prices empty to
          charge bottles × the bottle price.
        </p>
        {packs.map((pack) => (
          <PackForm key={pack.id} productId={product.id} pack={pack} />
        ))}
        {/* Keyed by count so the blank row resets after each add. */}
        <PackForm key={`new-${packs.length}`} productId={product.id} pack={null} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recent stock movements</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-neutral-500">No movements yet.</p>
        ) : (
          <table className="w-full max-w-2xl text-left text-sm">
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1.5 pr-4 text-neutral-500">{dateFormat.format(m.occurredAt)}</td>
                  <td className="py-1.5 pr-4">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                  <td className={`py-1.5 pr-4 text-right font-medium ${m.quantity < 0 ? "text-red-600" : "text-green-700"}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="py-1.5 text-neutral-500">{[m.by, m.reason].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
