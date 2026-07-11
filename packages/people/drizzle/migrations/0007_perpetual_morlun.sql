ALTER TABLE "people"."employment_period" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "employee_no" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "work_email" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "dob" date;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "emergency_contact" jsonb;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "profile_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "cv_storage_key" text;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "org_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "availability_status" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "ooo_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "work_start" time;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "work_end" time;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."person" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people"."person" ADD CONSTRAINT "person_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "people"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_uniq_employee_no_per_tenant" ON "people"."person" USING btree ("tenant_id","employee_no") WHERE employee_no IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "person_uniq_email_per_tenant" ON "people"."person" USING btree ("tenant_id","work_email") WHERE work_email IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "person_by_tenant_live" ON "people"."person" USING btree ("tenant_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "person_by_org_unit" ON "people"."person" USING btree ("tenant_id","org_unit_id");--> statement-breakpoint
ALTER TABLE "people"."person" ADD CONSTRAINT "person_gender_check" CHECK (gender IN ('male', 'female', 'prefer_not_to_say'));--> statement-breakpoint
ALTER TABLE "people"."person" ADD CONSTRAINT "person_availability_status_check" CHECK (availability_status IN ('available', 'busy', 'ooo'));