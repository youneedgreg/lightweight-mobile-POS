import { requireAdmin } from "@/lib/auth/dal";

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {admin.name ?? "owner"}</h1>
      <p className="text-neutral-500">Sales, profit and stock alerts arrive in Phase 5.</p>
    </div>
  );
}
