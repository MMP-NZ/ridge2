CREATE TYPE "public"."meta_lead_delivery_status" AS ENUM('received', 'processed', 'duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ad_balance_entry_type" AS ENUM('topup', 'spend');--> statement-breakpoint
CREATE TYPE "public"."ad_platform" AS ENUM('meta', 'google');--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"webhook_subscribed_at" timestamp with time zone,
	CONSTRAINT "meta_connections_one_per_tenant" UNIQUE("tenant_id"),
	CONSTRAINT "meta_connections_page_id_unique" UNIQUE("page_id")
);
--> statement-breakpoint
CREATE TABLE "meta_lead_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"leadgen_id" text NOT NULL,
	"lead_id" uuid,
	"status" "meta_lead_delivery_status" DEFAULT 'received' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_lead_deliveries_leadgen_id_unique" UNIQUE("leadgen_id")
);
--> statement-breakpoint
CREATE TABLE "ad_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"low_balance_threshold_cents" integer DEFAULT 20000 NOT NULL,
	"last_alert_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_balances_one_per_tenant" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "ad_balance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "ad_balance_entry_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform" "ad_platform",
	"campaign" text,
	"note" text,
	"staff_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_lead_deliveries" ADD CONSTRAINT "meta_lead_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_lead_deliveries" ADD CONSTRAINT "meta_lead_deliveries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_balances" ADD CONSTRAINT "ad_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_balance_entries" ADD CONSTRAINT "ad_balance_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_balance_entries" ADD CONSTRAINT "ad_balance_entries_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_lead_deliveries_tenant_idx" ON "meta_lead_deliveries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ad_balance_entries_tenant_idx" ON "ad_balance_entries" USING btree ("tenant_id");