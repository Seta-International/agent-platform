CREATE TABLE "people"."performance_cycle_unlock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_month" text NOT NULL,
	"account_id" uuid NOT NULL,
	"action" text NOT NULL,
	"expires_at" timestamp with time zone,
	"reason" text NOT NULL,
	"actor_person_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_cycle_unlock_action_check" CHECK (action IN ('unlock', 'relock')),
	CONSTRAINT "perf_cycle_unlock_ym" CHECK (review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "perf_cycle_unlock_expiry" CHECK ((action = 'unlock') = (expires_at IS NOT NULL)),
	CONSTRAINT "perf_cycle_unlock_window" CHECK (expires_at IS NULL OR expires_at <= created_at + interval '5 days'),
	CONSTRAINT "perf_cycle_unlock_reason_present" CHECK (length(btrim(reason)) > 0)
);
--> statement-breakpoint
CREATE INDEX "perf_cycle_unlock_lookup" ON "people"."performance_cycle_unlock" USING btree ("tenant_id","review_month","account_id","seq");