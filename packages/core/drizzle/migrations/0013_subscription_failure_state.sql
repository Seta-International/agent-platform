CREATE TABLE "core"."subscription_failure_state" (
	"subscription" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"attempts" integer NOT NULL,
	"first_failed_at" timestamp with time zone NOT NULL,
	"last_error" text NOT NULL,
	"next_retry_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
