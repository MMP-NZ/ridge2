CREATE TYPE "public"."visit_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'blocked', 'failed');--> statement-breakpoint
CREATE TABLE "calendar_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_days_of_week" smallint[] NOT NULL,
	"quote_hours_start_min" smallint DEFAULT 480 NOT NULL,
	"quote_hours_end_min" smallint DEFAULT 960 NOT NULL,
	"visit_length_minutes" smallint DEFAULT 45 NOT NULL,
	"travel_buffer_minutes" smallint DEFAULT 15 NOT NULL,
	"max_visits_per_quote_day" smallint,
	"service_area_suburbs" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_rules_one_per_tenant" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "visit_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_tenant_start_at_unique" UNIQUE("tenant_id","start_at")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"lead_id" uuid,
	"channel" "message_channel" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"template_key" text NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "booking_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_rules" ADD CONSTRAINT "calendar_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visits_tenant_lead_idx" ON "visits" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "messages_tenant_customer_idx" ON "messages" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "messages_tenant_lead_idx" ON "messages" USING btree ("tenant_id","lead_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_booking_token_unique" UNIQUE("booking_token");