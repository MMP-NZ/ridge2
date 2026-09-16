CREATE TYPE "public"."visit_condition" AS ENUM('good', 'fair', 'poor', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."price_book_kind" AS ENUM('per_m2', 'per_metre', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('ready_to_schedule', 'scheduled', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "price_book_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "price_book_kind" NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"unit" text,
	"category" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_book_items_tenant_name_unique" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"visit_id" uuid,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"quote_token" text NOT NULL,
	"subtotal_ex_gst_cents" integer DEFAULT 0 NOT NULL,
	"gst_cents" integer DEFAULT 0 NOT NULL,
	"total_inc_gst_cents" integer DEFAULT 0 NOT NULL,
	"gst_rate_bp" integer DEFAULT 1500 NOT NULL,
	"notes" text,
	"valid_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_name" text,
	"accepted_ip" text,
	"accepted_user_agent" text,
	"declined_at" timestamp with time zone,
	"decline_reason" text,
	"supersedes_quote_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_quote_token_unique" UNIQUE("quote_token"),
	CONSTRAINT "quotes_total_matches_parts" CHECK ("quotes"."total_inc_gst_cents" = "quotes"."subtotal_ex_gst_cents" + "quotes"."gst_cents")
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"price_book_item_id" uuid,
	"description" text NOT NULL,
	"kind" "price_book_kind" NOT NULL,
	"quantity_thousandths" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_ex_gst_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"client_photo_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"caption" text,
	"include_in_quote" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_photos_tenant_client_photo_unique" UNIQUE("tenant_id","client_photo_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'ready_to_schedule' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "client_capture_id" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "roof_type" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "material" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "pitch_degrees" real;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "area_m2" real;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "condition" "visit_condition";--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "site_notes" text;--> statement-breakpoint
ALTER TABLE "price_book_items" ADD CONSTRAINT "price_book_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supersedes_quote_id_quotes_id_fk" FOREIGN KEY ("supersedes_quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_price_book_item_id_price_book_items_id_fk" FOREIGN KEY ("price_book_item_id") REFERENCES "public"."price_book_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_book_items_tenant_active_idx" ON "price_book_items" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "quotes_tenant_status_idx" ON "quotes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "quotes_tenant_lead_idx" ON "quotes" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "quote_lines_tenant_quote_idx" ON "quote_lines" USING btree ("tenant_id","quote_id");--> statement-breakpoint
CREATE INDEX "visit_photos_tenant_visit_idx" ON "visit_photos" USING btree ("tenant_id","visit_id");--> statement-breakpoint
CREATE INDEX "jobs_tenant_status_idx" ON "jobs" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_client_capture_unique" UNIQUE("tenant_id","client_capture_id");