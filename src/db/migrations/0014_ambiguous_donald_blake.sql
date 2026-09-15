CREATE TYPE "public"."platform_invoice_status" AS ENUM('draft', 'sent', 'paid', 'voided');--> statement-breakpoint
CREATE TABLE "platform_xero_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" text DEFAULT 'only' NOT NULL,
	"xero_tenant_id" text NOT NULL,
	"organisation_name" text,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"needs_reconnect_at" timestamp with time zone,
	CONSTRAINT "platform_xero_connection_singleton_unique" UNIQUE("singleton")
);
--> statement-breakpoint
CREATE TABLE "platform_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"plan_fee_cents" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"ad_top_ups_cents" integer NOT NULL,
	"total_ex_gst_cents" integer NOT NULL,
	"status" "platform_invoice_status" DEFAULT 'draft' NOT NULL,
	"xero_invoice_id" text,
	"invoice_number" text,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_invoices_tenant_month_unique" UNIQUE("tenant_id","period_month")
);
--> statement-breakpoint
CREATE TABLE "max_hours_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"staff_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	CONSTRAINT "onboarding_steps_tenant_key_unique" UNIQUE("tenant_id","step_key")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "monthly_fee_cents" integer DEFAULT 20000 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "max_hours_entries" ADD CONSTRAINT "max_hours_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "max_hours_entries" ADD CONSTRAINT "max_hours_entries_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_invoices_month_idx" ON "platform_invoices" USING btree ("period_month");--> statement-breakpoint
CREATE INDEX "max_hours_tenant_month_idx" ON "max_hours_entries" USING btree ("tenant_id","period_month");