import { sql } from "drizzle-orm";

import { db } from "@/db";

/** Liveness + database connectivity check. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
