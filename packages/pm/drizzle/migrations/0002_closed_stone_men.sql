CREATE TABLE "pm"."account_recruiter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"recruiter_worker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_recruiter_uniq" ON "pm"."account_recruiter" USING btree ("tenant_id","account_id","recruiter_worker_id");--> statement-breakpoint
CREATE INDEX "account_recruiter_by_account" ON "pm"."account_recruiter" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "account_recruiter_by_recruiter" ON "pm"."account_recruiter" USING btree ("tenant_id","recruiter_worker_id");