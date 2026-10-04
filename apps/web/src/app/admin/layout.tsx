import Link from "next/link";

import { signOut } from "@/auth";
import { requireAdmin } from "@/lib/auth/dal";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/admin" className="font-semibold">
            Liquor POS
          </Link>
          <nav className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/users">Staff</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-neutral-500 sm:inline">{admin.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1 dark:border-neutral-700">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
