import { formatKes } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LedgerTable } from "@/components/ledger-table";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { supplierLedgerEntries } from "@/lib/ledgers";

import { SupplierForm } from "../../_parties/forms";

export const metadata: Metadata = { title: "Supplier · Liquor POS" };

export default async function SupplierPage({ params }: PageProps<"/admin/suppliers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
  if (!supplier) notFound();
  const entries = await supplierLedgerEntries(id);
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/suppliers" className="text-sm text-neutral-500">
          ‹ Suppliers
        </Link>
        <PageHeader title={supplier.name} description={`We owe ${formatKes(balance)}`} />
      </div>
      <SupplierForm supplier={supplier} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Ledger</h2>
        <p className="text-sm text-neutral-500">Deliveries and payments are recorded from the POS app.</p>
        <LedgerTable rows={entries} emptyText="No deliveries or payments yet." />
      </section>
    </div>
  );
}
