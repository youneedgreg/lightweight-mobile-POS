import { asc, desc } from "drizzle-orm";
import type { Metadata } from "next";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";

import { setUserActive } from "./actions";
import { CreateCashierForm, PhoneForm, ResetPinForm } from "./forms";

export const metadata: Metadata = { title: "Staff · Liquor POS" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const staff = await db.query.users.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      pinHash: true,
      lockedUntil: true,
    },
    orderBy: [asc(users.role), desc(users.isActive), asc(users.name)],
  });
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-neutral-500">
          Cashiers log in on the POS app with their phone number and PIN. To use the app yourself,
          add your phone number and set a PIN on your own row.
        </p>
        <CreateCashierForm />
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Login</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">PIN</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {staff.map((user) => {
              const locked = user.lockedUntil !== null && user.lockedUntil > now;
              return (
                <tr key={user.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                  <td className="py-3 pr-4 font-medium">{user.name ?? "—"}</td>
                  <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400">
                    {user.role === "ADMIN" ? (
                      <div className="flex flex-col gap-1">
                        <span>{user.email}</span>
                        <PhoneForm userId={user.id} phone={user.phone} />
                      </div>
                    ) : (
                      user.phone
                    )}
                  </td>
                  <td className="py-3 pr-4">{user.role === "ADMIN" ? "Owner" : "Cashier"}</td>
                  <td className="py-3 pr-4">
                    {!user.isActive ? (
                      <span className="text-neutral-400">Disabled</span>
                    ) : locked ? (
                      <span className="text-amber-600">Locked</span>
                    ) : (
                      <span className="text-green-700">Active</span>
                    )}
                    {!user.pinHash && <span className="block text-xs text-neutral-400">No PIN set</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <ResetPinForm userId={user.id} />
                  </td>
                  <td className="py-3 text-right">
                    {user.id !== admin.id && (
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="active" value={String(!user.isActive)} />
                        <button type="submit" className="text-sm text-neutral-600 underline dark:text-neutral-400">
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
