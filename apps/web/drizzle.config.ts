import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Local commands target the Neon `dev` branch. `pnpm db:migrate:prod` sets
// DB_TARGET=production to use the production branch instead.
// Migrations need a direct (non-pooled) connection.
const url =
  process.env.DB_TARGET === "production"
    ? process.env.PROD_DATABASE_URL_UNPOOLED
    : (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

if (!url) {
  throw new Error(
    process.env.DB_TARGET === "production"
      ? "PROD_DATABASE_URL_UNPOOLED must be set"
      : "DATABASE_URL_UNPOOLED or DATABASE_URL must be set",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
