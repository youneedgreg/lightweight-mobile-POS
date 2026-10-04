import { formatKes } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LedgerTable } from "@/components/ledger-table";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { customerLedgerEntries } from "@/lib/ledgers";

import { CustomerForm } from "../../_parties/forms";

export const metadata: Metadata = { title: "Customer · Liquor POS" };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!customer) notFound();
  const entries = await customerLedgerEntries(id);
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/customers" className="text-sm text-neutral-500">
          ‹ Customers
        </Link>
        <PageHeader title={customer.name} description={`Owes ${formatKes(balance)}`} />
      </div>
      <CustomerForm customer={customer} />
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Ledger</h2>
        <p className="text-sm text-neutral-500">
          Payments and corrections are recorded from the POS app (Debts screen), so they count toward the till.
        </p>
        <LedgerTable rows={entries} emptyText="No credit history." />
      </section>
    </div>
  );
}
