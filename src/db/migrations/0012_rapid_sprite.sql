CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'submitted', 'authorised', 'paid', 'voided', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."invoice_payment_kind" AS ENUM('payment', 'credit_note');--> statement-breakpoint
CREATE TABLE "xero_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"xero_tenant_id" text NOT NULL,
	"organisation_name" text,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"needs_reconnect_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "xero_connections_one_per_tenant" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"xero_invoice_id" text NOT NULL,
	"invoice_number" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"total_ex_gst_cents" integer DEFAULT 0 NOT NULL,
	"total_inc_gst_cents" integer DEFAULT 0 NOT NULL,
	"net_paid_ex_gst_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"sent_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"xero_payment_id" text NOT NULL,
	"kind" "invoice_payment_kind" DEFAULT 'payment' NOT NULL,
	"amount_ex_gst_cents" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_tenant_xero_id_unique" UNIQUE("tenant_id","xero_payment_id")
);
--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"invoice_payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"rate_bp" integer NOT NULL,
	"cap_cents" integer NOT NULL,
	"net_paid_ex_gst_cents" integer NOT NULL,
	"running_commission_cents" integer NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"eligibility_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_entries_invoice_payment_id_unique" UNIQUE("invoice_payment_id")
);
--> statement-breakpoint
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_invoice_payment_id_invoice_payments_id_fk" FOREIGN KEY ("invoice_payment_id") REFERENCES "public"."invoice_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_tenant_status_idx" ON "invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "invoices_tenant_xero_id_idx" ON "invoices" USING btree ("tenant_id","xero_invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_payments_tenant_invoice_idx" ON "invoice_payments" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "commission_entries_tenant_created_idx" ON "commission_entries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "commission_entries_tenant_job_idx" ON "commission_entries" USING btree ("tenant_id","job_id");