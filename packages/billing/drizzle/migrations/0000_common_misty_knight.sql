CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE TABLE "billing"."budget_counters" (
	"tenant_id" uuid NOT NULL,
	"period_type" text NOT NULL,
	"period_key" text NOT NULL,
	"spend" numeric(20, 10) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "budget_counters_tenant_id_period_type_period_key_pk" PRIMARY KEY("tenant_id","period_type","period_key")
);
--> statement-breakpoint
CREATE TABLE "billing"."usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_event_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model_key" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"unit_price_in" numeric(20, 10) NOT NULL,
	"unit_price_out" numeric(20, 10) NOT NULL,
	"cost" numeric(20, 10) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"caused_by_user_id" uuid,
	"period_day" date NOT NULL,
	"period_month" text NOT NULL,
	CONSTRAINT "usage_ledger_source_event_id_unique" UNIQUE("source_event_id")
);
--> statement-breakpoint
CREATE INDEX "usage_ledger_by_tenant_time" ON "billing"."usage_ledger" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_ledger_by_tenant_month" ON "billing"."usage_ledger" USING btree ("tenant_id","period_month");