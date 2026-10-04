import { formatKes } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { customers, devices, emptiesLedger, payments, productUnits, products, saleItems, sales, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { dateTimeFormat } from "@/lib/dates";

export const metadata: Metadata = { title: "Receipt · Liquor POS" };

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", MPESA: "M-Pesa", CREDIT: "Credit" };

export default async function SalePage({ params }: PageProps<"/admin/sales/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [sale] = await db
    .select({
      sale: sales,
      cashier: users.name,
      device: devices.label,
      customer: customers.name,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .innerJoin(devices, eq(devices.id, sales.deviceId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.id, id));
  if (!sale) notFound();

  const [items, paid, empties] = await Promise.all([
    db
      .select({ item: saleItems, product: products.name, size: products.size, pack: productUnits.name })
      .from(saleItems)
      .innerJoin(products, eq(products.id, saleItems.productId))
      .leftJoin(productUnits, eq(productUnits.id, saleItems.productUnitId))
      .where(eq(saleItems.saleId, id)),
    db.select().from(payments).where(eq(payments.saleId, id)),
    db
      .select({ type: emptiesLedger.type, quantity: emptiesLedger.quantity, deposit: emptiesLedger.deposit, product: products.name })
      .from(emptiesLedger)
      .innerJoin(products, eq(products.id, emptiesLedger.productId))
      .where(eq(emptiesLedger.saleId, id)),
  ]);
  const s = sale.sale;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/sales" className="text-sm text-neutral-500">
          ‹ Sales
        </Link>
        <PageHeader
          title={`Receipt ${s.receiptNo}`}
          description={`${dateTimeFormat.format(s.occurredAt)} · ${sale.cashier} on ${sale.device}${sale.customer ? ` · ${sale.customer}` : ""}${s.priceTier === "WHOLESALE" ? " · wholesale prices" : ""}`}
        />
      </div>

      <table className="w-full text-left text-sm">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-1 font-medium">Item</th>
            <th className="py-1 text-right font-medium">Qty</th>
            <th className="py-1 text-right font-medium">Price</th>
            <th className="py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
          {items.map(({ item, product, size, pack }) => (
            <tr key={item.id} className="border-t border-neutral-100 dark:border-neutral-900">
              <td className="py-1.5">
                {product} {size} {pack && <span className="text-neutral-500">({pack})</span>}
              </td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">
                {formatKes(item.unitPrice)}
                {item.unitPrice !== item.listUnitPrice && (
                  <div className="text-xs text-amber-700 dark:text-amber-400">list {formatKes(item.listUnitPrice)}</div>
                )}
              </td>
              <td className="py-1.5 text-right">{formatKes(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot style={{ fontVariantNumeric: "tabular-nums" }}>
          {s.discountTotal !== 0 && (
            <tr className="border-t border-neutral-200 text-neutral-500 dark:border-neutral-800">
              <td colSpan={3} className="py-1.5">Discount</td>
              <td className="py-1.5 text-right">−{formatKes(s.discountTotal)}</td>
            </tr>
          )}
          {s.depositTotal > 0 && (
            <tr className="text-neutral-500">
              <td colSpan={3} className="py-1.5">Bottle deposits</td>
              <td className="py-1.5 text-right">{formatKes(s.depositTotal)}</td>
            </tr>
          )}
          <tr className="border-t border-neutral-200 font-semibold dark:border-neutral-800">
            <td colSpan={3} className="py-1.5">Paid</td>
            <td className="py-1.5 text-right">{formatKes(s.total + s.depositTotal)}</td>
          </tr>
          <tr className="text-neutral-500">
            <td colSpan={3} className="py-1.5">Gross profit (cost {formatKes(s.costTotal)})</td>
            <td className="py-1.5 text-right">{formatKes(s.total - s.costTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <section className="flex flex-col gap-1 text-sm">
        <h2 className="font-semibold">Payments</h2>
        {paid.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>
              {METHOD_LABEL[p.method]} {p.reference && <span className="text-neutral-500">· {p.reference}</span>}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatKes(p.amount)}</span>
          </div>
        ))}
      </section>

      {empties.length > 0 && (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">Empties</h2>
          {empties.map((e, index) => (
            <div key={index} className="text-neutral-600 dark:text-neutral-400">
              {e.type === "RETURNED_BY_CUSTOMER" ? `${e.quantity} empty ${e.product} brought back` : `Deposit ${formatKes(e.deposit)} for ${e.product}`}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
