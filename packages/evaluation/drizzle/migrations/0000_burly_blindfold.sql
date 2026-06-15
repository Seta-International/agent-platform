CREATE SCHEMA "evaluation";
--> statement-breakpoint
CREATE TABLE "evaluation"."case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"output" text,
	"status" text NOT NULL,
	"error" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation"."cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"ground_truth" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation"."datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation"."runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_model" text NOT NULL,
	"scorer_ids" jsonb NOT NULL,
	"judge_model" text,
	"summary" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation"."scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_result_id" uuid NOT NULL,
	"scorer_id" text NOT NULL,
	"score" double precision NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "case_results_by_run" ON "evaluation"."case_results" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_results_run_case_unique" ON "evaluation"."case_results" USING btree ("run_id","case_id");--> statement-breakpoint
CREATE INDEX "cases_by_dataset" ON "evaluation"."cases" USING btree ("tenant_id","dataset_id");--> statement-breakpoint
CREATE INDEX "datasets_by_tenant" ON "evaluation"."datasets" USING btree ("tenant_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "runs_by_dataset" ON "evaluation"."runs" USING btree ("tenant_id","dataset_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "scores_by_case_result" ON "evaluation"."scores" USING btree ("case_result_id");