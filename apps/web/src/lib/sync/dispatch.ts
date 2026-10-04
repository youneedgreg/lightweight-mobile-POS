import "server-only";

import { SYNC_KINDS, type SyncItemResult, type SyncKind } from "@liquor-pos/shared";
import type { z } from "zod";

import { rejected, roleOf, type Uploader } from "./common";
import { recordIntake } from "./intake";
import {
  createCustomer,
  recordCustomerPayment,
  recordEmptiesReturn,
  recordExpense,
  recordLedgerAdjustment,
  recordSupplierPayment,
} from "./money";
import { recordSale } from "./sale";
import { closeShift, openShift } from "./shifts";

type Parsed<K extends SyncKind> = z.output<(typeof SYNC_KINDS)[K]["schema"]>;

type Handlers = { [K in SyncKind]: (data: Parsed<K>, uploader: Uploader) => Promise<SyncItemResult> };

const HANDLERS: Handlers = {
  customer: (data) => createCustomer(data),
  shift_open: openShift,
  intake: (data) => recordIntake(data),
  sale: recordSale,
  customer_payment: (data) => recordCustomerPayment(data),
  supplier_payment: (data) => recordSupplierPayment(data),
  expense: (data) => recordExpense(data),
  empties_return: (data) => recordEmptiesReturn(data),
  ledger_adjustment: (data) => recordLedgerAdjustment(data),
  shift_close: closeShift,
};

/** Who made a record, for the owner-only check. */
function actorOf(kind: SyncKind, data: Record<string, unknown>): unknown {
  switch (kind) {
    case "intake":
      return data.receivedById;
    case "supplier_payment":
      return data.paidById;
    default:
      return data.createdById;
  }
}

function idOf(data: unknown): string {
  return typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : "unknown";
}

/**
 * Validates and stores one uploaded record. Owner-only records must be both
 * made by an owner and uploaded while an owner is signed in on the phone.
 */
export async function processSyncItem(kind: SyncKind, raw: unknown, uploader: Uploader): Promise<SyncItemResult> {
  const definition = SYNC_KINDS[kind];
  const parsed = definition.schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return rejected(idOf(raw), issue ? `${issue.path.join(".") || kind}: ${issue.message}` : `Invalid ${kind}`);
  }
  const data = parsed.data as Parsed<typeof kind>;

  if (definition.adminOnly) {
    if (uploader.role !== "ADMIN") return rejected(data.id, "Only the owner can upload this.");
    const actor = actorOf(kind, data as Record<string, unknown>);
    if (typeof actor !== "string" || (await roleOf(actor)) !== "ADMIN") {
      return rejected(data.id, "Only the owner can do this.");
    }
  }

  const handler = HANDLERS[kind] as (data: Parsed<typeof kind>, uploader: Uploader) => Promise<SyncItemResult>;
  return handler(data, uploader);
}
