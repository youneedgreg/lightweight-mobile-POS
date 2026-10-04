import { asc } from "drizzle-orm";
import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";

import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product · Liquor POS" };

export default async function NewProductPage() {
  await requireAdmin();
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New product" description="Add crates and cartons after saving." />
      <ProductForm product={null} categories={categoryRows} />
    </div>
  );
}
