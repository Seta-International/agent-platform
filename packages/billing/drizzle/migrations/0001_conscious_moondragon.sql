CREATE TABLE "billing"."tenant_budgets" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"daily_limit" numeric(20, 10),
	"monthly_limit" numeric(20, 10),
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
