import type { MeResponse } from "@liquor-pos/shared";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { devices, users } from "@/db/schema";
import { ANY_ROLE, withAuth } from "@/lib/auth/guard";
import { apiError } from "@/lib/http";

/** Who am I? Used by the POS app on launch to confirm its token is still valid. */
export const GET = withAuth(ANY_ROLE, async (_request, _context, principal) => {
  const [user, device] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, principal.userId),
      columns: { id: true, name: true, phone: true, role: true },
    }),
    principal.deviceId
      ? db.query.devices.findFirst({
          where: eq(devices.id, principal.deviceId),
          columns: { id: true, label: true, receiptPrefix: true },
        })
      : undefined,
  ]);
  if (!user) return apiError("UNAUTHORIZED", "Not signed in.");

  const body: MeResponse = { user, device: device ?? null };
  return Response.json(body);
});
