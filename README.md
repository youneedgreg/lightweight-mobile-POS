# Liquor POS

Offline-first point of sale and back office for a single liquor store with several cashier phones.

| Path | What | Stack |
| --- | --- | --- |
| `apps/web` | API + admin command center | Next.js 16 (App Router), Drizzle ORM, Neon Postgres, Vercel Blob |
| `apps/mobile` | Cashier POS app | Expo SDK 57, Expo Router, NativeWind 4, expo-sqlite (Phase 3) |
| `packages/shared` | Enums, money helpers, Zod wire schemas used by both apps | TypeScript, Zod 4 |

## Getting started

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in values (or `vercel env pull`)
pnpm dev:web      # http://localhost:3000
pnpm dev:mobile   # Expo dev server
```

To preview the mobile app in a browser against the local API, use the `web` and `mobile-web` configurations in `.claude/launch.json`, or set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local`.

## Database

Schema lives in `apps/web/src/db/schema.ts`. Migrations are generated SQL files committed in `apps/web/drizzle/`.

Local development uses the Neon **`dev` branch**. Production is only touched by `db:migrate:prod`.

```bash
pnpm db:generate      # create a migration from schema changes
pnpm db:migrate       # apply migrations to the dev branch
pnpm db:migrate:prod  # apply migrations to production (run before pushing code that needs them)
pnpm db:seed          # create the first admin (and optional test cashier) from SEED_* env vars
pnpm db:studio        # browse data
```

## Authentication

| Who | Where | How |
| --- | --- | --- |
| Owner (`ADMIN`) | Web dashboard `/admin` | Email + password via Auth.js (JWT session, 12 h) |
| Cashier (`CASHIER`), or owner with a PIN | POS app | Phone + 4–6 digit PIN → `POST /api/mobile/auth/login` → bearer token (7 days), bound to the device |

- API routes use `withAuth([...roles], handler)` from `src/lib/auth/guard.ts`, which accepts either the bearer token or the web session and re-checks the database on every request.
- Pages and server actions use `requireAdmin()` from `src/lib/auth/dal.ts`. `src/proxy.ts` only does optimistic redirects.
- 5 wrong passwords/PINs lock the account for 15 minutes. An owner PIN reset unlocks it.
- Resetting a PIN or disabling a user bumps `token_version`, which signs that user out of every phone immediately. Disabling a device does the same for that phone.
- Owners manage staff at `/admin/users`.

## Offline sync

The POS app keeps a full copy of the catalog in SQLite (`apps/mobile/src/db`) and sells without a connection.

- **Completing a sale** happens in one local transaction: the receipt number is allocated (`<device prefix>-<counter>`, e.g. `D1-000042`), the sale is saved to local history, a copy goes into the `sync_queue` outbox, and local stock goes down.
- **Sync** (`apps/mobile/src/sync`) runs on login, when the network returns, when the app comes to the foreground, every 60 s, and after each sale. It **pushes** the outbox to `POST /api/mobile/sync` (customers first, then sales in batches of 50), then **pulls** catalog changes from `GET /api/mobile/catalog?since=<cursor>`.
- **The server** (`apps/web/src/lib/sales/record-sale.ts`) stores each sale in one transaction: sale, items, payments, stock movements, cached stock, a credit ledger entry and an audit entry for price overrides. Re-sending a sale returns `duplicate`. A sale that can never be stored returns `rejected`; the phone keeps it and marks it "needs attention" for the owner.
- A phone uploads sales on behalf of whichever cashier made them (`cashierId` in the sale), but only sales made on that same device.

For local testing, `pnpm db:seed:demo` loads a demo catalog into the **dev** branch. It refuses to run against production.

## Domain rules

- Money is whole Kenyan shillings stored as integers. Never use floats.
- Stock is an append-only ledger (`stock_movement`) in base units (bottles); `product.stock_on_hand` is a cached sum. Stock may go negative after offline sales; the dashboard flags it.
- Rows created on phones use client-generated UUIDs, so re-syncing is idempotent.
- Packs (crates, cartons) are `product_unit` rows with their own barcode and `units_per_pack`.
- A sale can have several payments (split payment). Credit payments post to the customer ledger.

## Infrastructure

- Vercel project `liquor-pos` (root directory `apps/web`, functions in `fra1`): https://liquor-pos-murex.vercel.app
- Neon project `liquor-pos` (`aws-eu-central-1`), database `liquor_pos`
- Vercel Blob store `liquor-pos-images` (public, `fra1`)
- Health check: `GET /api/health`
