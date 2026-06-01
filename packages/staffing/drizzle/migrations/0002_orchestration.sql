-- hand-written: drizzle-kit prompts on snapshot drift in a non-TTY environment.
CREATE TABLE "staffing"."orchestration_runs" (
  "run_id" uuid PRIMARY KEY NOT NULL,
  "orchestration_id" text NOT NULL,
  "tenant_id" uuid NOT NULL,
  "initiated_by" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "input" jsonb NOT NULL,
  "state" jsonb DEFAULT '{"outputs":{}}'::jsonb NOT NULL,
  "result" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staffing"."orchestration_step_trace" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "step_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "reasoning_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence_score" numeric(4, 3),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "orchestration_runs_by_tenant" ON "staffing"."orchestration_runs" ("tenant_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_step_trace_uniq" ON "staffing"."orchestration_step_trace" ("run_id", "step_id");
