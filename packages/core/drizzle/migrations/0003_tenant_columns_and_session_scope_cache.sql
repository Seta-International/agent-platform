CREATE TABLE "core"."session_scope_cache" (
	"session_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_summary_hash" text NOT NULL,
	"role_summary" jsonb NOT NULL,
	"accessible_group_ids" jsonb NOT NULL,
	"cross_tenant_read" boolean DEFAULT false NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "core"."tenants" ADD COLUMN "idle_timeout_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."tenants" ADD COLUMN "local_password_disabled" boolean DEFAULT false NOT NULL;