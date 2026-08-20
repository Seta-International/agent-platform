ALTER TABLE "people"."performance_evaluation" DROP CONSTRAINT "perf_eval_not_self";--> statement-breakpoint
ALTER TABLE "people"."performance_evaluation" DROP CONSTRAINT "performance_evaluation_evaluator_capacity_check";--> statement-breakpoint
DROP INDEX "people"."perf_eval_uniq_subject_project_month";--> statement-breakpoint
CREATE UNIQUE INDEX "perf_eval_uniq_manager_review" ON "people"."performance_evaluation" USING btree ("tenant_id","review_month","subject_person_id","project_id") WHERE subject_person_id <> evaluator_person_id;--> statement-breakpoint
CREATE UNIQUE INDEX "perf_eval_uniq_self_assessment" ON "people"."performance_evaluation" USING btree ("tenant_id","review_month","subject_person_id","project_id") WHERE subject_person_id = evaluator_person_id;--> statement-breakpoint
ALTER TABLE "people"."performance_evaluation" ADD CONSTRAINT "perf_eval_self_capacity" CHECK ((evaluator_capacity = 'self') = (subject_person_id = evaluator_person_id));--> statement-breakpoint
ALTER TABLE "people"."performance_evaluation" ADD CONSTRAINT "performance_evaluation_evaluator_capacity_check" CHECK (evaluator_capacity IN ('tl', 'am', 'self'));