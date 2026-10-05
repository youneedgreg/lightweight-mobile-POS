I built an offline-first POS for liquor stores in Kenya 🇰🇪🍺

Most small shops here lose internet a few times a day. A POS that stops selling when the network drops isn't a POS. So I designed this one to work with no connection at all.

What it does:
📱 Android app for cashiers: scan with the camera or a Bluetooth scanner, split payments (cash / M-Pesa / credit), bottle deposits and empties, shift open/close with a cash count
🖥️ Web dashboard for the owner: revenue, gross profit, payment mix, low/negative stock alerts, till shortages, customer debts and supplier balances
📦 Stock intake that breaks crates into bottles ("5 crates × 25 = 125 bottles in stock")

The engineering I'm proudest of:
→ Every sale is written to SQLite on the phone first, then synced through an outbox. Each record carries a client-generated UUID, so retries are idempotent. In testing, 50 sales made offline uploaded as exactly 50, and re-sending all of them created zero duplicates.
→ The stock ledger is append-only. Stock can go negative after offline sales. Instead of rejecting a real sale, the dashboard flags it for a recount.
→ The server re-computes each till's expected cash from the synced records and compares it with the cashier's count.
→ Role-based auth: owners use email + password on the web, and cashiers use phone + PIN on device-bound tokens that can be revoked instantly.

Stack: React Native (Expo) + expo-sqlite · Next.js on Vercel · Neon Postgres + Drizzle ORM · Auth.js · Vercel Blob · TypeScript end to end in a pnpm monorepo with shared Zod contracts.

Shipping next: M-Pesa STK Push via Safaricom's Daraja API, so the customer gets the payment prompt on their phone and the sale closes itself when the callback confirms it.

Code is open: https://github.com/youneedgreg/lightweight-mobile-POS

Screenshots show demo data. Feedback welcome, especially from anyone who's run a shop counter 👇

#ReactNative #NextJS #TypeScript #OfflineFirst #Kenya #MPesa #BuildInPublic #SoftwareEngineering
