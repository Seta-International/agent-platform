CREATE TABLE "billing"."model_pricing" (
	"model_key" text PRIMARY KEY NOT NULL,
	"unit_price_in" numeric(20, 10) NOT NULL,
	"unit_price_out" numeric(20, 10) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
