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
- Owners manage staff at `/admin/users`, including their own phone number and PIN for using the POS app.

## Owner dashboard

`/admin/products` (prices, packs, opening stock, bottle photos stored in Vercel Blob), `/admin/customers`, `/admin/suppliers` (balances and ledgers) and `/admin/users`. Photos can also be taken on the phone (Menu → Bottle photos). Both upload through `POST /api/admin/products/[id]/image`.

## Offline sync

The POS app keeps a full copy of the catalog in SQLite (`apps/mobile/src/db`) and sells without a connection.

- **Everything the phone records** (sales, shifts, customer and supplier payments, expenses, empties returns, stock intakes, balance corrections) is applied locally and queued in the `sync_queue` outbox **in the same transaction**. Receipt numbers are `<device prefix>-<counter>`, e.g. `D1-000042`.
- **Sync** (`apps/mobile/src/sync`) runs on login, when the network returns, when the app comes to the foreground, every 60 s, and after each change. It **pushes** the outbox to `POST /api/mobile/sync` in batches of 50, in dependency order (customers → shift opens → intakes → sales → money movements → shift closes; see `SYNC_KINDS` in `packages/shared/src/operations.ts`), then **pulls** catalog changes from `GET /api/mobile/catalog?since=<cursor>`.
- **The server** (`apps/web/src/lib/sync/*`) stores each record in its own transaction. Re-sending returns `duplicate`. A record that can never be stored returns `rejected`; the phone keeps it under "Needs attention" on the Sales & sync screen.
- Phones upload records on behalf of whoever made them (`cashierId`, `createdById` …), but only for their own device. Owner-only records (stock intake, supplier payments, balance corrections) must be made by an owner and are uploaded only while an owner is signed in.

### Till and shifts

A phone sells only during an open shift. Opening records the float. Every cash movement in the shift goes into a local `cash_movements` log: cash taken in sales (including deposits), cash debt repayments, cash expenses, cash paid to suppliers and deposit refunds. Closing compares the expected cash with the counted cash. The server recomputes the expected figure from the uploaded records (`apps/web/src/lib/sync/shifts.ts`).

### Empties and deposits

Returnable products have a deposit per bottle. At checkout, every bottle not exchanged for an empty pays the deposit, on top of the item total (`sale.deposit_total` is kept separate from revenue). Empties brought back later are refunded from the till. Everything is recorded in `empties_ledger_entry`.

### Stock intake (case-breaking)

The owner scans a bottle or a crate barcode. For a crate, the app asks to confirm breaking it into bottles (e.g. 2 crates × 24 = 48 bottles). The delivery sets each product's latest cost price, and whatever wasn't paid on delivery is added to the supplier's balance.

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
