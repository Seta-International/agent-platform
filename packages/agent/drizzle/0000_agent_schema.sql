-- hand-written: squashed initial migration — replaces 0000-0009 (agent schema renamed to agent)
CREATE SCHEMA IF NOT EXISTS agent;
--> statement-breakpoint
CREATE TABLE "agent"."workflow_runs" (
  "run_id"           uuid         PRIMARY KEY NOT NULL,
  "workflow_id"      text         NOT NULL,
  "tenant_id"        uuid         NOT NULL,
  "started_by"       uuid         NOT NULL,
  "started_via"      text         NOT NULL,
  "parent_thread_id" uuid,
  "parent_run_id"    uuid,
  "source_event_id"  uuid,
  "input_summary"    jsonb        NOT NULL,
  "status"           text         NOT NULL,
  "suspend_reason"   text,
  "error_summary"    text,
  "started_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at"      timestamp with time zone,
  "duration_ms"      integer
);
--> statement-breakpoint
CREATE TABLE "agent"."workflow_approvals" (
  "approval_id"                uuid         PRIMARY KEY NOT NULL,
  "run_id"                     uuid         NOT NULL,
  "step_id"                    text         NOT NULL,
  "proposed_payload"           jsonb        NOT NULL,
  "approver_user_id"           uuid         NOT NULL,
  "fallback_approver_user_id"  uuid,
  "surface_canvas"             boolean      DEFAULT true NOT NULL,
  "surface_chat_thread_id"     uuid,
  "status"                     text         NOT NULL,
  "decision_payload"           jsonb,
  "decided_by"                 uuid,
  "decided_at"                 timestamp with time zone,
  "expires_at"                 timestamp with time zone NOT NULL,
  "created_at"                 timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_approvals_run_id_workflow_runs_run_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "agent"."workflow_runs"("run_id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "agent"."workflow_run_events_seen" (
  "run_id"    uuid   NOT NULL,
  "event_seq" bigint NOT NULL,
  CONSTRAINT "workflow_run_events_seen_run_id_event_seq_pk" PRIMARY KEY("run_id","event_seq")
);
--> statement-breakpoint
CREATE TABLE "agent"."tenant_settings" (
  "tenant_id"           uuid    PRIMARY KEY NOT NULL,
  "dedup_weights"       jsonb   NOT NULL,
  "dedup_thresholds"    jsonb   NOT NULL,
  "assignment_weights"  jsonb   NOT NULL,
  "approval_ttl_hours"  integer DEFAULT 72 NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent"."rate_limits" (
  "tenant_id"    uuid                       NOT NULL,
  "user_id"      uuid                       NOT NULL,
  "window_start" timestamp(0) with time zone NOT NULL,
  "tokens_in"    integer DEFAULT 0           NOT NULL,
  "tokens_out"   integer DEFAULT 0           NOT NULL,
  "turns"        integer DEFAULT 0           NOT NULL,
  CONSTRAINT "rate_limits_tenant_id_user_id_window_start_pk" PRIMARY KEY("tenant_id","user_id","window_start")
);
--> statement-breakpoint
CREATE INDEX "workflow_approvals_approver_status_idx"
  ON "agent"."workflow_approvals" USING btree ("approver_user_id","status");
--> statement-breakpoint
-- hand-written: partial index — Drizzle pgTable cannot express WHERE clause
CREATE INDEX IF NOT EXISTS "workflow_approvals_pending_expires_idx"
  ON "agent"."workflow_approvals" ("expires_at")
  WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX "workflow_runs_tenant_status_started_at_idx"
  ON "agent"."workflow_runs" USING btree ("tenant_id","status","started_at" desc);
--> statement-breakpoint
CREATE INDEX "workflow_runs_actor_started_at_idx"
  ON "agent"."workflow_runs" USING btree ("tenant_id","started_by","started_at" desc);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_source_event_id_idx"
  ON "agent"."workflow_runs" USING btree ("source_event_id");
--> statement-breakpoint
CREATE INDEX "rl_by_tenant_window"
  ON "agent"."rate_limits" USING btree ("tenant_id","window_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rl_cleanup_window"
  ON "agent"."rate_limits" USING btree ("window_start");
