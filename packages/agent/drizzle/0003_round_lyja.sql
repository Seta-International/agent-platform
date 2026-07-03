CREATE TABLE "agent"."workflow_run_steps" (
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"reasoning_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_score" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_steps_tenant_id_run_id_step_id_pk" PRIMARY KEY("tenant_id","run_id","step_id"),
	CONSTRAINT "workflow_run_steps_confidence_check" CHECK (confidence_score BETWEEN 0 AND 1)
);
--> statement-breakpoint
DROP INDEX "agent"."workflow_runs_source_event_id_idx";--> statement-breakpoint
ALTER TABLE "agent"."tenant_settings" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent"."workflow_approvals" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent"."workflow_run_events_seen" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent"."workflow_runs" ADD COLUMN "state" jsonb DEFAULT '{"outputs":{}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent"."workflow_runs" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "agent"."workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent"."workflow_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent"."workflow_run_events_seen" ADD CONSTRAINT "workflow_run_events_seen_run_id_workflow_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent"."workflow_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_source_event_id_idx" ON "agent"."workflow_runs" USING btree ("tenant_id","source_event_id");--> statement-breakpoint
ALTER TABLE "agent"."workflow_approvals" ADD CONSTRAINT "workflow_approvals_status_check" CHECK (status IN ('pending', 'approved', 'rejected', 'modified', 'superseded', 'expired'));--> statement-breakpoint
ALTER TABLE "agent"."workflow_runs" ADD CONSTRAINT "workflow_runs_status_check" CHECK (status IN ('running', 'paused', 'success', 'failed', 'canceled'));