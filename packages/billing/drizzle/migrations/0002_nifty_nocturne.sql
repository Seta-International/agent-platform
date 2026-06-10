CREATE TABLE "billing"."budget_alerts" (
	"tenant_id" uuid NOT NULL,
	"period_type" text NOT NULL,
	"period_key" text NOT NULL,
	"threshold" integer NOT NULL,
	"alerted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_alerts_tenant_id_period_type_period_key_threshold_pk" PRIMARY KEY("tenant_id","period_type","period_key","threshold")
);
