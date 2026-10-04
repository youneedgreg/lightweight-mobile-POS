import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";

import { CustomerForm } from "../../_parties/forms";

export const metadata: Metadata = { title: "New customer · Liquor POS" };

export default async function NewCustomerPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New customer" />
      <CustomerForm customer={null} />
    </div>
  );
}
