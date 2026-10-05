/**
 * Adds two weeks of realistic DEMO activity and bottle illustrations through
 * the real mobile API, exactly as phones would: an opening delivery, daily
 * sales (cash / M-Pesa / credit, crates, deposits), expenses, a mid-period
 * restock with a supplier payment, closed shifts, and a photo per product.
 *
 * Run after `pnpm db:seed:demo[:prod]`:
 *   DEMO_API_URL=https://… pnpm demo:activity
 * Uses the demo logins (DEMO_OWNER_PHONE/PIN, DEMO_CASHIER_PHONE/PIN). Safe to
 * run once per database; running it again adds another two weeks.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { randomUUID } from "node:crypto";

import sharp from "sharp";

interface Login {
  token: string;
  user: { id: string };
  device: { receiptPrefix: string };
}
interface CatalogProduct {
  id: string;
  name: string;
  size: string | null;
  categoryId: string | null;
  retailPrice: number;
  costPrice: number | null;
  stockOnHand: number;
  isReturnable: boolean;
  depositAmount: number;
  imageUrl: string | null;
  isActive: boolean;
}
interface Catalog {
  products: CatalogProduct[];
  units: { id: string; productId: string; unitsPerPack: number; retailPrice: number | null; isActive: boolean }[];
  categories: { id: string; name: string }[];
  customers: { id: string; priceTier: "RETAIL" | "WHOLESALE"; isActive: boolean }[];
  suppliers: { id: string; name: string; balance: number }[];
}
type Item = { kind: string; data: Record<string, unknown> & { id: string } };

const BASE = (process.env.DEMO_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DAY = 86_400_000;

async function api<T>(path: string, init: { token?: string; body?: unknown; raw?: Buffer; contentType?: string } = {}): Promise<T> {
  const response = await fetch(BASE + path, {
    method: init.body !== undefined || init.raw ? "POST" : "GET",
    headers: {
      "content-type": init.contentType ?? "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.raw ? new Uint8Array(init.raw) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as T & { error?: { message: string } };
  if (!response.ok) throw new Error(`${path}: ${json?.error?.message ?? response.status}`);
  return json;
}

// Deterministic randomness so a demo looks the same every time it's seeded.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const shopToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
const at = (daysAgo: number, hour: number, minute: number) =>
  new Date(new Date(`${shopToday}T00:00:00+03:00`).getTime() - daysAgo * DAY + (hour * 60 + minute) * 60_000).toISOString();

async function sync(token: string, items: Item[]): Promise<number> {
  let created = 0;
  for (let i = 0; i < items.length; i += 50) {
    const { results } = await api<{ results: { status: string; message: string | null }[] }>("/api/mobile/sync", {
      token,
      body: { items: items.slice(i, i + 50) },
    });
    created += results.filter((r) => r.status === "created").length;
    const rejected = results.find((r) => r.status === "rejected");
    if (rejected) console.warn("  rejected:", rejected.message);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Bottle illustrations (drawn, not brand photos)
// ---------------------------------------------------------------------------

const STYLE: Record<string, { glass: string; liquid: string; label: string; shape: "beer" | "spirit" | "wine" | "soda" }> = {
  Beer: { glass: "#7c4a12", liquid: "#a66a1f", label: "#f5e6c8", shape: "beer" },
  Spirits: { glass: "#dfe7ee", liquid: "#f4f7fa", label: "#1f2937", shape: "spirit" },
  Wine: { glass: "#1f3b2a", liquid: "#5b1020", label: "#f3ece0", shape: "wine" },
  "Soft drinks": { glass: "#c81e1e", liquid: "#c81e1e", label: "#ffffff", shape: "soda" },
};

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function bottleSvg(product: CatalogProduct, category: string): string {
  const style = STYLE[category] ?? STYLE.Spirits!;
  const words = product.name.split(" ");
  const line1 = escapeXml(words.slice(0, 2).join(" "));
  const line2 = escapeXml(words.slice(2).join(" "));
  const textColor = style.shape === "spirit" ? "#ffffff" : "#1f2937";
  // Shrink long names so they stay inside the ~150px label (Helvetica is ~0.56em per character).
  const fit = (text: string, max: number) => Math.min(max, Math.floor(150 / (0.56 * Math.max(text.length, 1))));
  const body =
    style.shape === "soda"
      ? `<rect x="215" y="190" width="170" height="470" rx="40" fill="${style.glass}"/><rect x="235" y="170" width="130" height="30" rx="10" fill="#9ca3af"/>`
      : style.shape === "wine"
        ? `<rect x="275" y="70" width="50" height="190" rx="10" fill="${style.glass}"/><path d="M275 250 c-60 40 -70 80 -70 130 v260 c0 25 20 40 45 40 h100 c25 0 45 -15 45 -40 v-260 c0 -50 -10 -90 -70 -130 z" fill="${style.glass}"/>`
        : style.shape === "spirit"
          ? `<rect x="270" y="80" width="60" height="70" rx="8" fill="#9ca3af"/><rect x="275" y="140" width="50" height="80" fill="${style.glass}"/><path d="M275 210 c-70 20 -80 60 -80 100 v330 c0 25 20 40 45 40 h120 c25 0 45 -15 45 -40 v-330 c0 -40 -10 -80 -80 -100 z" fill="${style.glass}" stroke="#9ca3af" stroke-width="4"/>`
          : `<rect x="272" y="70" width="56" height="40" rx="8" fill="#d4a017"/><rect x="278" y="105" width="44" height="150" fill="${style.glass}"/><path d="M278 250 c-40 30 -70 60 -70 110 v280 c0 25 20 40 45 40 h94 c25 0 45 -15 45 -40 v-280 c0 -50 -30 -80 -70 -110 z" fill="${style.glass}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
    <rect width="600" height="800" fill="#f8f7f4"/>
    <ellipse cx="300" cy="700" rx="150" ry="18" fill="#000" opacity="0.08"/>
    ${body}
    <rect x="${style.shape === "soda" ? 225 : 215}" y="400" width="${style.shape === "soda" ? 150 : 170}" height="150" rx="10" fill="${style.label}" opacity="0.95"/>
    <text x="300" y="460" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fit(line1, 28)}" font-weight="700" fill="${textColor}">${line1}</text>
    <text x="300" y="495" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fit(line2, 24)}" font-weight="600" fill="${textColor}">${line2}</text>
    <text x="300" y="530" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="${textColor}" opacity="0.8">${escapeXml(product.size ?? "")}</text>
  </svg>`;
}

// ---------------------------------------------------------------------------

async function main() {
  const env = process.env;
  for (const key of ["DEMO_OWNER_PHONE", "DEMO_OWNER_PIN", "DEMO_CASHIER_PHONE", "DEMO_CASHIER_PIN"]) {
    if (!env[key]) throw new Error(`${key} must be set (see .env.example)`);
  }
  console.log(`Demo activity against ${BASE}`);

  const deviceId = randomUUID();
  const login = (phone: string, pin: string) =>
    api<Login>("/api/mobile/auth/login", { body: { phone, pin, deviceId, deviceLabel: "Demo till" } });
  const owner = await login(env.DEMO_OWNER_PHONE as string, env.DEMO_OWNER_PIN as string);
  const cashier = await login(env.DEMO_CASHIER_PHONE as string, env.DEMO_CASHIER_PIN as string);
  const catalog = await api<Catalog>("/api/mobile/catalog", { token: owner.token });

  const products = catalog.products.filter((p) => p.isActive);
  const categoryName = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const unitsFor = (id: string) => catalog.units.filter((u) => u.productId === id && u.isActive);
  const customers = catalog.customers.filter((c) => c.isActive);
  const supplier = catalog.suppliers.find((s) => s.name.startsWith("KBL")) ?? catalog.suppliers[0];
  if (!supplier || products.length === 0) throw new Error("Run the demo catalog seed first");
  const prefix = owner.device.receiptPrefix;
  const cost = (p: CatalogProduct) => p.costPrice ?? Math.round(p.retailPrice * 0.78);

  // 1. Opening delivery 15 days ago, part-paid by M-Pesa.
  const opening: Item = {
    kind: "intake",
    data: {
      id: randomUUID(), supplierId: supplier.id, receivedById: owner.user.id, shiftId: null, invoiceRef: "KBL-10231",
      items: products.map((p) => {
        const unit = unitsFor(p.id)[0];
        return { id: randomUUID(), productId: p.id, productUnitId: unit?.id ?? null, quantity: unit ? 8 : 60, unitCost: cost(p) };
      }),
      amountPaid: 150000, paymentMethod: "MPESA", paymentReference: "SJA1KBL001", notes: null, occurredAt: at(15, 9, 0),
    },
  };
  console.log("  opening delivery:", await sync(owner.token, [opening]));

  // 2. Fourteen days of trading, busier at the weekend, one closed shift per day.
  const weights = products.map((p) => (/Tusker|Guinness|White Cap|Balozi/.test(p.name) ? 6 : /Coca|Dasani/.test(p.name) ? 3 : 2));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedProduct = () => {
    let x = rand() * totalWeight;
    for (let i = 0; i < products.length; i++) if ((x -= weights[i] ?? 0) < 0) return products[i] as CatalogProduct;
    return products[0] as CatalogProduct;
  };
  const items: Item[] = [];
  let receipt = 0;
  for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
    const shiftId = randomUUID();
    const float = 3000;
    let cash = 0;
    let cashExpenses = 0;
    items.push({ kind: "shift_open", data: { id: shiftId, deviceId, cashierId: cashier.user.id, openingFloat: float, openedAt: at(daysAgo, 10, 0) } });

    const weekday = new Date(`${shopToday}T12:00:00+03:00`).getTime() - daysAgo * DAY;
    const dow = new Date(weekday).getUTCDay();
    const count = int(10, 18) + (dow === 5 || dow === 6 ? int(10, 16) : 0);
    for (let s = 0; s < count; s++) {
      const lines: Record<string, unknown>[] = [];
      const empties: Record<string, unknown>[] = [];
      for (let l = 0; l < int(1, 3); l++) {
        const product = weightedProduct();
        const unit = rand() < 0.07 ? (unitsFor(product.id)[0] ?? null) : null;
        if (lines.some((x) => x.productId === product.id)) continue;
        const price = unit ? (unit.retailPrice ?? product.retailPrice * unit.unitsPerPack) : product.retailPrice;
        const quantity = unit ? 1 : int(1, 4);
        lines.push({ id: randomUUID(), productId: product.id, productUnitId: unit?.id ?? null, quantity, listUnitPrice: price, unitPrice: price });
        if (product.isReturnable) {
          const bottles = quantity * (unit?.unitsPerPack ?? 1);
          const returned = rand() < 0.7 ? bottles : int(0, bottles);
          empties.push({ productId: product.id, returned, depositCharged: (bottles - returned) * product.depositAmount });
        }
      }
      const total =
        lines.reduce((sum, x) => sum + (x.unitPrice as number) * (x.quantity as number), 0) +
        empties.reduce((sum, e) => sum + (e.depositCharged as number), 0);
      const roll = rand();
      const customer = roll > 0.9 ? pick(customers) : null;
      const method = customer ? "CREDIT" : roll > 0.62 ? "MPESA" : "CASH";
      if (method === "CASH") cash += total;
      receipt++;
      items.push({
        kind: "sale",
        data: {
          id: randomUUID(), receiptNo: `${prefix}-${String(receipt).padStart(6, "0")}`, deviceId, cashierId: cashier.user.id, shiftId,
          customerId: customer?.id ?? null, priceTier: customer?.priceTier ?? "RETAIL", items: lines, empties,
          payments: [{ id: randomUUID(), method, amount: total, reference: method === "MPESA" ? `S${randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase()}` : null }],
          occurredAt: at(daysAgo, int(11, 21), int(0, 59)),
        },
      });
    }
    if (rand() < 0.55) {
      const amount = pick([200, 300, 500, 800]);
      cashExpenses += amount;
      items.push({
        kind: "expense",
        data: { id: randomUUID(), category: pick(["CASUAL_LABOUR", "TRANSPORT", "SUPPLIES"]), description: pick(["Offloading crates", "Boda to depot", "Ice and cups", "Cleaning"]), amount, method: "CASH", shiftId, createdById: cashier.user.id, occurredAt: at(daysAgo, 18, 30) },
      });
    }
    // Mostly balanced tills, with the occasional small shortage.
    const expected = float + cash - cashExpenses;
    const counted = expected - (rand() < 0.2 ? pick([50, 100, 200]) : 0);
    items.push({ kind: "shift_close", data: { id: shiftId, closedById: cashier.user.id, countedCash: counted, closedAt: at(daysAgo, 22, 45), notes: counted < expected ? "Counted twice" : null } });
  }
  console.log("  trading days:", await sync(cashier.token, items.filter((i) => i.kind !== "shift_close")), "records");
  console.log("  shifts closed:", await sync(cashier.token, items.filter((i) => i.kind === "shift_close")));

  // 3. Restock everything that ran low, and settle most of the supplier's bill.
  const afterTrading = await api<Catalog>("/api/mobile/catalog", { token: owner.token });
  const restock = afterTrading.products
    .filter((p) => p.isActive && p.stockOnHand < 40 && !p.name.startsWith("Dasani"))
    .map((p) => ({ id: randomUUID(), productId: p.id, productUnitId: null, quantity: Math.max(0, -p.stockOnHand) + 48, unitCost: cost(p) }));
  const owed = afterTrading.suppliers.find((s) => s.id === supplier.id)?.balance ?? 0;
  const restockCost = restock.reduce((sum, r) => sum + r.quantity * r.unitCost, 0);
  console.log(
    "  restock + supplier payment:",
    await sync(owner.token, [
      ...(restock.length
        ? [{ kind: "intake", data: { id: randomUUID(), supplierId: supplier.id, receivedById: owner.user.id, shiftId: null, invoiceRef: "KBL-10388", items: restock, amountPaid: 0, paymentMethod: null, paymentReference: null, notes: null, occurredAt: at(7, 9, 30) } }]
        : []),
      ...(owed + restockCost > 120000
        ? [{ kind: "supplier_payment", data: { id: randomUUID(), supplierId: supplier.id, paidById: owner.user.id, shiftId: null, method: "MPESA", amount: owed + restockCost - 120000, reference: "SJB7KBL002", note: "Statement settlement", occurredAt: at(6, 11, 0) } }]
        : []),
    ]),
  );

  // 4. A bottle illustration per product.
  let photos = 0;
  for (const product of products) {
    if (product.imageUrl) continue;
    const jpeg = await sharp(Buffer.from(bottleSvg(product, categoryName.get(product.categoryId ?? "") ?? "Spirits")))
      .jpeg({ quality: 85 })
      .toBuffer();
    await api(`/api/admin/products/${product.id}/image`, { token: owner.token, raw: jpeg, contentType: "image/jpeg" });
    photos++;
  }
  console.log("  bottle photos uploaded:", photos);
  console.log(`Done. Demo till receipts use prefix ${prefix}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
