import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

// Node < 22 has no global WebSocket; the Neon Pool needs one for transactions.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = (await import("ws")).default;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Pooled WebSocket connection, so we can run interactive transactions
 * (a synced sale writes sale + items + payments + stock movements atomically).
 */
const pool = new Pool({ connectionString });

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export { schema };
