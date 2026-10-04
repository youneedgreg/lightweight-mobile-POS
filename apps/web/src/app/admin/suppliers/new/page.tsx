import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";

import { SupplierForm } from "../../_parties/forms";

export const metadata: Metadata = { title: "New supplier · Liquor POS" };

export default async function NewSupplierPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New supplier" />
      <SupplierForm supplier={null} />
    </div>
  );
}
