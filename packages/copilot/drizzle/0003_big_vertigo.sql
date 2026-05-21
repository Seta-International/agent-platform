CREATE TABLE "copilot"."workflow_approvals" (
	"approval_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"proposed_payload" jsonb NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"fallback_approver_user_id" uuid,
	"surface_canvas" boolean DEFAULT true NOT NULL,
	"surface_chat_thread_id" uuid,
	"status" text NOT NULL,
	"decision_payload" jsonb,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot"."workflow_run_events_seen" (
	"run_id" uuid NOT NULL,
	"event_seq" bigint NOT NULL,
	CONSTRAINT "workflow_run_events_seen_run_id_event_seq_pk" PRIMARY KEY("run_id","event_seq")
);
--> statement-breakpoint
CREATE TABLE "copilot"."workflow_runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"started_by" uuid NOT NULL,
	"started_via" text NOT NULL,
	"parent_thread_id" uuid,
	"parent_run_id" uuid,
	"source_event_id" uuid,
	"input_summary" jsonb NOT NULL,
	"status" text NOT NULL,
	"suspend_reason" text,
	"error_summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "copilot"."workflow_approvals" ADD CONSTRAINT "workflow_approvals_run_id_workflow_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "copilot"."workflow_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_approvals_approver_status_idx" ON "copilot"."workflow_approvals" USING btree ("approver_user_id","status");--> statement-breakpoint
CREATE INDEX "workflow_runs_tenant_status_started_at_idx" ON "copilot"."workflow_runs" USING btree ("tenant_id","status","started_at" desc);--> statement-breakpoint
CREATE INDEX "workflow_runs_actor_started_at_idx" ON "copilot"."workflow_runs" USING btree ("tenant_id","started_by","started_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_source_event_id_idx" ON "copilot"."workflow_runs" USING btree ("source_event_id");