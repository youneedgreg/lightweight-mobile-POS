ALTER TABLE "sale" ADD COLUMN "deposit_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shift" ADD COLUMN "closed_by_id" text;--> statement-breakpoint
ALTER TABLE "stock_intake" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_ledger_entry" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_closed_by_id_user_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_intake" ADD CONSTRAINT "stock_intake_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger_entry" ADD CONSTRAINT "supplier_ledger_entry_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;