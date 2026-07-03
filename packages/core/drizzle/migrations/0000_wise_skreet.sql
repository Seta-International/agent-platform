CREATE TABLE "core"."outgoing_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"template" text NOT NULL,
	"to_address" text NOT NULL,
	"props_hash" text NOT NULL,
	"transport_kind" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"transport_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outgoing_emails_status_check" CHECK (status IN ('pending', 'sent', 'permanently_failed')),
	CONSTRAINT "outgoing_emails_transport_kind_check" CHECK (transport_kind IN ('graph', 'smtp', 'dev-stub', 'operator-smtp', 'operator-dev-stub'))
);
--> statement-breakpoint
CREATE TABLE "core"."rpc_idempotency" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"method" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."session_scope_cache" (
	"session_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_summary_hash" text NOT NULL,
	"role_summary" jsonb NOT NULL,
	"cross_tenant_read" boolean DEFAULT false NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."skill_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."subscription_failure_state" (
	"subscription" text PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"attempts" integer NOT NULL,
	"first_failed_at" timestamp with time zone NOT NULL,
	"last_error" text NOT NULL,
	"next_retry_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."subscription_cursors" (
	"subscription" text PRIMARY KEY NOT NULL,
	"last_processed_event_id" uuid NOT NULL,
	"last_processed_occurred_at" timestamp with time zone DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	"last_processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."subscription_dead_letter" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscription" text NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"attempts" integer NOT NULL,
	"last_error" text NOT NULL,
	"payload" jsonb NOT NULL,
	"first_failed_at" timestamp with time zone NOT NULL,
	"dead_lettered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."subscription_processed" (
	"subscription" text NOT NULL,
	"event_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_processed_subscription_event_id_pk" PRIMARY KEY("subscription","event_id")
);
--> statement-breakpoint
CREATE TABLE "core"."tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"idle_timeout_days" integer DEFAULT 30 NOT NULL,
	"local_password_disabled" boolean DEFAULT false NOT NULL,
	"email_domains" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "core"."skill" ADD CONSTRAINT "skill_category_id_skill_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "core"."skill_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outgoing_emails_tenant_dedupe_idx" ON "core"."outgoing_emails" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "outgoing_emails_tenant_created_idx" ON "core"."outgoing_emails" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "outgoing_emails_pending_idx" ON "core"."outgoing_emails" USING btree ("status") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "skill_uniq_name" ON "core"."skill" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "skill_by_category" ON "core"."skill" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_category_uniq_name" ON "core"."skill_category" USING btree ("tenant_id","name");