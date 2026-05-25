CREATE TABLE "copilot"."tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"dedup_weights" jsonb NOT NULL,
	"dedup_thresholds" jsonb NOT NULL,
	"assignment_weights" jsonb NOT NULL,
	"approval_ttl_hours" integer DEFAULT 72 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
