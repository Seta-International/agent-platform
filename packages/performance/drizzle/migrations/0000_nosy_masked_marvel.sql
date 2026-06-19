CREATE SCHEMA "performance";
--> statement-breakpoint
CREATE TABLE "performance"."employee_master" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"role_title" text NOT NULL,
	"department" text NOT NULL,
	"level" text NOT NULL,
	"employment_status" text NOT NULL,
	"join_date" date NOT NULL,
	"performance_tier" text NOT NULL,
	"overall_score_latest" double precision NOT NULL,
	CONSTRAINT "employee_master_tenant_id_member_id_pk" PRIMARY KEY("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."norm_rules" (
	"tenant_id" uuid NOT NULL,
	"norm_id" text NOT NULL,
	"category" text NOT NULL,
	"rule_description" text NOT NULL,
	"threshold" text NOT NULL,
	"classification_label" text NOT NULL,
	"action_if_triggered" text NOT NULL,
	"priority" text NOT NULL,
	"applies_to" text NOT NULL,
	CONSTRAINT "norm_rules_tenant_id_norm_id_pk" PRIMARY KEY("tenant_id","norm_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."performance_by_project" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"report_period" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"total_point" double precision NOT NULL,
	"classification" text NOT NULL,
	"feedback_category" text NOT NULL,
	"review_frequency" text NOT NULL,
	CONSTRAINT "performance_by_project_tenant_id_member_id_report_period_pk" PRIMARY KEY("tenant_id","member_id","report_period")
);
--> statement-breakpoint
CREATE TABLE "performance"."performance_profile" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"avg_score_t3_t4" double precision,
	"classification_latest" text NOT NULL,
	"ts_compliance_t4" text NOT NULL,
	"total_ot_hours_t4" double precision NOT NULL,
	"violation_risk_flag" text NOT NULL,
	"open_violation_count" integer NOT NULL,
	"allocation_status" text NOT NULL,
	"readiness_score" double precision,
	"salary_band" text,
	"perf_risk_note" text NOT NULL,
	CONSTRAINT "performance_profile_tenant_id_member_id_pk" PRIMARY KEY("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."project_master" (
	"tenant_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"project_id" text NOT NULL,
	"project_name" text NOT NULL,
	CONSTRAINT "project_master_tenant_id_project_id_pk" PRIMARY KEY("tenant_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."promotion_intent" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"current_level" text NOT NULL,
	"target_level" text NOT NULL,
	"readiness_score" double precision NOT NULL,
	CONSTRAINT "promotion_intent_tenant_id_member_id_pk" PRIMARY KEY("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."resource_allocation" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"account_id" text NOT NULL,
	"project_id" text NOT NULL,
	"assignment_type" text NOT NULL,
	"role" text NOT NULL,
	"report_to" text NOT NULL,
	"allocation_pct" double precision NOT NULL,
	"work_on_other" text NOT NULL,
	"other_project_ids" text,
	"notes" text,
	CONSTRAINT "resource_allocation_tenant_id_member_id_pk" PRIMARY KEY("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."salary_band" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"salary_band" text NOT NULL,
	"effective_date" date NOT NULL,
	CONSTRAINT "salary_band_tenant_id_member_id_pk" PRIMARY KEY("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."timesheet" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"report_period" text NOT NULL,
	"work_days_in_month" integer NOT NULL,
	"days_probation" double precision NOT NULL,
	"days_official" double precision NOT NULL,
	"days_holiday_official" double precision NOT NULL,
	"days_leave_approved" double precision NOT NULL,
	"days_late" double precision NOT NULL,
	"days_absent_unapproved" double precision NOT NULL,
	"actual_work_days" double precision NOT NULL,
	"ot_hours_weekday" double precision NOT NULL,
	"ot_hours_weekend" double precision NOT NULL,
	"ot_hours_holiday" double precision NOT NULL,
	"total_ot_hours" double precision NOT NULL,
	"night_shift_hours" double precision NOT NULL,
	CONSTRAINT "timesheet_tenant_id_member_id_report_period_pk" PRIMARY KEY("tenant_id","member_id","report_period")
);
--> statement-breakpoint
CREATE TABLE "performance"."violation_summary" (
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"total_violations" integer NOT NULL,
	"critical_count" integer NOT NULL,
	"high_count" integer NOT NULL,
	"medium_count" integer NOT NULL,
	"low_count" integer NOT NULL,
	"open_cases" integer NOT NULL,
	"risk_flag" text NOT NULL,
	CONSTRAINT "violation_summary_tenant_id_member_id_pk" PRIMARY KEY("tenant_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "performance"."violation_type_ref" (
	"tenant_id" uuid NOT NULL,
	"violation_type_code" text NOT NULL,
	"category" text NOT NULL,
	"violation_type_desc" text NOT NULL,
	"typical_severity" text NOT NULL,
	"typical_consequence" text NOT NULL,
	CONSTRAINT "violation_type_ref_tenant_id_violation_type_code_pk" PRIMARY KEY("tenant_id","violation_type_code")
);
--> statement-breakpoint
CREATE TABLE "performance"."violations" (
	"tenant_id" uuid NOT NULL,
	"violation_id" text NOT NULL,
	"member_id" text NOT NULL,
	"category" text NOT NULL,
	"violation_type_code" text NOT NULL,
	"violation_type_desc" text NOT NULL,
	"severity" text NOT NULL,
	"consequence" text NOT NULL,
	"status" text NOT NULL,
	"incident_date" date NOT NULL,
	"reported_by" text NOT NULL,
	"action_taken" text NOT NULL,
	CONSTRAINT "violations_tenant_id_violation_id_pk" PRIMARY KEY("tenant_id","violation_id")
);
--> statement-breakpoint
CREATE INDEX "norm_by_category" ON "performance"."norm_rules" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "perf_by_period" ON "performance"."performance_by_project" USING btree ("tenant_id","report_period");--> statement-breakpoint
CREATE INDEX "profile_by_risk" ON "performance"."performance_profile" USING btree ("tenant_id","violation_risk_flag");--> statement-breakpoint
CREATE INDEX "alloc_by_account" ON "performance"."resource_allocation" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "violations_by_member" ON "performance"."violations" USING btree ("tenant_id","member_id");