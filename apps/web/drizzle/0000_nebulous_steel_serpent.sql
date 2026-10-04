CREATE TYPE "public"."customer_ledger_type" AS ENUM('CREDIT_SALE', 'PAYMENT', 'SALE_VOID', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('CUSTOMER', 'PROMOTER');--> statement-breakpoint
CREATE TYPE "public"."empties_ledger_type" AS ENUM('DEPOSIT_COLLECTED', 'RETURNED_BY_CUSTOMER', 'RETURNED_TO_SUPPLIER', 'RECEIVED_FROM_SUPPLIER', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('CASUAL_LABOUR', 'TRANSPORT', 'RENT', 'UTILITIES', 'SUPPLIES', 'LICENSES', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'MPESA', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."price_tier" AS ENUM('RETAIL', 'WHOLESALE');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('COMPLETED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('SALE', 'SALE_VOID', 'INTAKE', 'CASE_BREAK_OUT', 'CASE_BREAK_IN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."supplier_ledger_type" AS ENUM('PURCHASE', 'PAYMENT', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'CASHIER');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "customer_ledger_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "customer_ledger_type" NOT NULL,
	"amount" integer NOT NULL,
	"sale_id" uuid,
	"payment_id" uuid,
	"note" text,
	"created_by_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"type" "customer_type" DEFAULT 'CUSTOMER' NOT NULL,
	"price_tier" "price_tier" DEFAULT 'RETAIL' NOT NULL,
	"credit_limit" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"receipt_prefix" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_receipt_prefix_unique" UNIQUE("receipt_prefix")
);
--> statement-breakpoint
CREATE TABLE "empties_ledger_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "empties_ledger_type" NOT NULL,
	"quantity" integer NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"customer_id" uuid,
	"supplier_id" uuid,
	"sale_id" uuid,
	"shift_id" uuid,
	"note" text,
	"created_by_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"shift_id" uuid,
	"created_by_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_amount_positive" CHECK ("expense"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid,
	"customer_id" uuid,
	"shift_id" uuid,
	"received_by_id" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'COMPLETED' NOT NULL,
	"amount" integer NOT NULL,
	"reference" text,
	"external_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "payment_amount_positive" CHECK ("payment"."amount" > 0),
	CONSTRAINT "payment_has_target" CHECK ("payment"."sale_id" IS NOT NULL OR "payment"."customer_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "product_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"barcode" text,
	"units_per_pack" integer NOT NULL,
	"retail_price" integer,
	"wholesale_price" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_unit_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "product_unit_units_positive" CHECK ("product_unit"."units_per_pack" > 1)
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"size" text,
	"sku" text,
	"barcode" text,
	"category_id" uuid,
	"retail_price" integer NOT NULL,
	"wholesale_price" integer,
	"cost_price" integer DEFAULT 0 NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"is_returnable" boolean DEFAULT false NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_sku_unique" UNIQUE("sku"),
	CONSTRAINT "product_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "product_prices_non_negative" CHECK ("product"."retail_price" >= 0 AND "product"."cost_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_unit_id" uuid,
	"quantity" integer NOT NULL,
	"base_quantity" integer NOT NULL,
	"list_unit_price" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sale_item_quantity_positive" CHECK ("sale_item"."quantity" > 0 AND "sale_item"."base_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receipt_no" text NOT NULL,
	"device_id" uuid NOT NULL,
	"shift_id" uuid,
	"cashier_id" text NOT NULL,
	"customer_id" uuid,
	"price_tier" "price_tier" DEFAULT 'RETAIL' NOT NULL,
	"status" "sale_status" DEFAULT 'COMPLETED' NOT NULL,
	"subtotal" integer NOT NULL,
	"discount_total" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"cost_total" integer DEFAULT 0 NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_id" text,
	"void_reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_receipt_no_unique" UNIQUE("receipt_no"),
	CONSTRAINT "sale_total_consistent" CHECK ("sale"."total" = "sale"."subtotal" - "sale"."discount_total")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cashier_id" text NOT NULL,
	"device_id" uuid NOT NULL,
	"status" "shift_status" DEFAULT 'OPEN' NOT NULL,
	"opening_float" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"expected_cash" integer,
	"counted_cash" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_intake_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intake_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_unit_id" uuid,
	"quantity" integer NOT NULL,
	"base_quantity" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"line_total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_intake" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid,
	"received_by_id" text NOT NULL,
	"invoice_ref" text,
	"total_cost" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"sale_id" uuid,
	"intake_id" uuid,
	"user_id" text NOT NULL,
	"device_id" uuid,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movement_non_zero" CHECK ("stock_movement"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_ledger_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"type" "supplier_ledger_type" NOT NULL,
	"amount" integer NOT NULL,
	"intake_id" uuid,
	"method" "payment_method",
	"reference" text,
	"note" text,
	"created_by_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp with time zone,
	"image" text,
	"phone" text,
	"role" "user_role" DEFAULT 'CASHIER' NOT NULL,
	"password_hash" text,
	"pin_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_unique" UNIQUE("phone"),
	CONSTRAINT "user_has_login" CHECK ("user"."email" IS NOT NULL OR "user"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger_entry" ADD CONSTRAINT "customer_ledger_entry_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger_entry" ADD CONSTRAINT "customer_ledger_entry_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger_entry" ADD CONSTRAINT "customer_ledger_entry_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger_entry" ADD CONSTRAINT "customer_ledger_entry_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_last_user_id_user_id_fk" FOREIGN KEY ("last_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empties_ledger_entry" ADD CONSTRAINT "empties_ledger_entry_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empties_ledger_entry" ADD CONSTRAINT "empties_ledger_entry_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empties_ledger_entry" ADD CONSTRAINT "empties_ledger_entry_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empties_ledger_entry" ADD CONSTRAINT "empties_ledger_entry_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empties_ledger_entry" ADD CONSTRAINT "empties_ledger_entry_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empties_ledger_entry" ADD CONSTRAINT "empties_ledger_entry_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_received_by_id_user_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_product_unit_id_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_cashier_id_user_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_voided_by_id_user_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_cashier_id_user_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_intake_item" ADD CONSTRAINT "stock_intake_item_intake_id_stock_intake_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."stock_intake"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_intake_item" ADD CONSTRAINT "stock_intake_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_intake_item" ADD CONSTRAINT "stock_intake_item_product_unit_id_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_intake" ADD CONSTRAINT "stock_intake_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_intake" ADD CONSTRAINT "stock_intake_received_by_id_user_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_intake_id_stock_intake_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."stock_intake"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger_entry" ADD CONSTRAINT "supplier_ledger_entry_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger_entry" ADD CONSTRAINT "supplier_ledger_entry_intake_id_stock_intake_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."stock_intake"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger_entry" ADD CONSTRAINT "supplier_ledger_entry_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_ledger_customer_idx" ON "customer_ledger_entry" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "customer_name_idx" ON "customer" USING btree ("name");--> statement-breakpoint
CREATE INDEX "customer_updated_at_idx" ON "customer" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "empties_ledger_product_idx" ON "empties_ledger_entry" USING btree ("product_id","occurred_at");--> statement-breakpoint
CREATE INDEX "expense_occurred_at_idx" ON "expense" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "payment_sale_idx" ON "payment" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "payment_shift_idx" ON "payment" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "payment_occurred_at_idx" ON "payment" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "product_unit_product_idx" ON "product_unit" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "product" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "product_updated_at_idx" ON "product" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "sale_item_sale_idx" ON "sale_item" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_item_product_idx" ON "sale_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_occurred_at_idx" ON "sale" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "sale_shift_idx" ON "sale" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "sale_customer_idx" ON "sale" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "shift_cashier_idx" ON "shift" USING btree ("cashier_id");--> statement-breakpoint
CREATE INDEX "shift_opened_at_idx" ON "shift" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "stock_intake_item_intake_idx" ON "stock_intake_item" USING btree ("intake_id");--> statement-breakpoint
CREATE INDEX "stock_intake_occurred_at_idx" ON "stock_intake" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movement_product_idx" ON "stock_movement" USING btree ("product_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movement_sale_idx" ON "stock_movement" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "supplier_ledger_supplier_idx" ON "supplier_ledger_entry" USING btree ("supplier_id","occurred_at");