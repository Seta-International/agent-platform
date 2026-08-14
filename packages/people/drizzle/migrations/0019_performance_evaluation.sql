CREATE TABLE "people"."performance_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_month" text NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"evaluator_person_id" uuid NOT NULL,
	"evaluator_capacity" text NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"overall" numeric(3, 2),
	"strengths" text DEFAULT '' NOT NULL,
	"improve" text DEFAULT '' NOT NULL,
	"top_action" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_evaluation_status_check" CHECK (status IN ('draft', 'submitted')),
	CONSTRAINT "performance_evaluation_evaluator_capacity_check" CHECK (evaluator_capacity IN ('tl', 'am')),
	CONSTRAINT "perf_eval_ym" CHECK (review_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "perf_eval_not_self" CHECK (subject_person_id <> evaluator_person_id),
	CONSTRAINT "perf_eval_overall_on_submit" CHECK ((status = 'submitted') = (overall IS NOT NULL AND submitted_at IS NOT NULL)),
	CONSTRAINT "perf_eval_overall_range" CHECK (overall IS NULL OR (overall >= 1 AND overall <= 5))
);
--> statement-breakpoint
CREATE TABLE "people"."performance_evaluation_score" (
	"tenant_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_evaluation_score_evaluation_id_criterion_id_pk" PRIMARY KEY("evaluation_id","criterion_id"),
	CONSTRAINT "perf_eval_score_range" CHECK (score >= 1 AND score <= 5)
);
--> statement-breakpoint
ALTER TABLE "people"."performance_evaluation" ADD CONSTRAINT "performance_evaluation_revision_id_performance_config_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "people"."performance_config_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."performance_evaluation_score" ADD CONSTRAINT "performance_evaluation_score_evaluation_id_performance_evaluation_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "people"."performance_evaluation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."performance_evaluation_score" ADD CONSTRAINT "performance_evaluation_score_criterion_id_performance_config_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "people"."performance_config_criterion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "perf_eval_uniq_subject_project_month" ON "people"."performance_evaluation" USING btree ("tenant_id","review_month","subject_person_id","project_id");--> statement-breakpoint
CREATE INDEX "perf_eval_by_account_month" ON "people"."performance_evaluation" USING btree ("tenant_id","account_id","review_month");--> statement-breakpoint
CREATE INDEX "perf_eval_by_evaluator" ON "people"."performance_evaluation" USING btree ("tenant_id","evaluator_person_id","review_month");