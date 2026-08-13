CREATE TABLE "people"."performance_cycle_unlock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_month" text NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_id" uuid,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actor_person_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_cycle_unlock_scope_kind_check" CHECK (scope_kind IN ('month', 'project', 'person')),
	CONSTRAINT "performance_cycle_unlock_action_check" CHECK (action IN ('unlock', 'relock')),
	CONSTRAINT "perf_cycle_unlock_ym" CHECK (review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "perf_cycle_unlock_scope_id" CHECK ((scope_kind = 'month') = (scope_id IS NULL)),
	CONSTRAINT "perf_cycle_unlock_reason_present" CHECK (length(btrim(reason)) > 0)
);
--> statement-breakpoint
CREATE INDEX "perf_cycle_unlock_lookup" ON "people"."performance_cycle_unlock" USING btree ("tenant_id","review_month","scope_kind","scope_id","created_at");