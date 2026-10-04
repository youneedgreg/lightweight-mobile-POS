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

## Database

Schema lives in `apps/web/src/db/schema.ts`. Migrations are generated SQL files committed in `apps/web/drizzle/`.

```bash
pnpm db:generate   # create a migration from schema changes
pnpm db:migrate    # apply migrations to DATABASE_URL_UNPOOLED
pnpm db:seed       # create the first admin from SEED_ADMIN_* env vars
pnpm db:studio     # browse data
```

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
