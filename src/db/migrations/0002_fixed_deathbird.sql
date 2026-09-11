CREATE TYPE "public"."lead_source" AS ENUM('juno_ads', 'juno_website', 'juno_referral', 'roofer_own');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'booked', 'visited', 'quoted', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."lead_event_actor_type" AS ENUM('roofer', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."lead_event_type" AS ENUM('created', 'stage_changed', 'source_changed');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"commercial_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_or_email_chk" CHECK ("customers"."phone" is not null or "customers"."email" is not null)
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"address" text NOT NULL,
	"lat" real,
	"lng" real,
	"roof_type" text,
	"material" text,
	"pitch_degrees" real,
	"area_m2" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"source" "lead_source" NOT NULL,
	"campaign" text,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "lead_event_type" NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_type" "lead_event_actor_type" NOT NULL,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "public_intake_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_tenant_phone_idx" ON "customers" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "customers_tenant_email_idx" ON "customers" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "properties_tenant_customer_idx" ON "properties" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "leads_tenant_stage_idx" ON "leads" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX "leads_tenant_customer_idx" ON "leads" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "lead_events_tenant_lead_idx" ON "lead_events" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "lead_events_occurred_at_idx" ON "lead_events" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_public_intake_key_unique" UNIQUE("public_intake_key");