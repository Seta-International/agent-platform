-- Hand-written: `drizzle-kit generate` currently fails for this module with a pre-existing
-- snapshot-chain collision (meta/0009_snapshot.json and meta/0018_snapshot.json both claim
-- meta/0008_snapshot.json as their parent — unrelated to this change, not repaired here).
-- The statements below match exactly what `generate` would emit for the interview/
-- interview_panelist tables and the candidate_event kind check added in db/schema.ts (FUT-487).
CREATE TABLE "hiring"."interview" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"round" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"mode" text NOT NULL,
	"meeting_link" text,
	"note" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"result" text,
	"rating" integer,
	"recommendation" text,
	"feedback_note" text,
	"outcome_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_round_check" CHECK (round IN ('screening', 'technical', 'culture_fit', 'final')),
	CONSTRAINT "interview_mode_check" CHECK (mode IN ('online', 'onsite')),
	CONSTRAINT "interview_status_check" CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
	CONSTRAINT "interview_result_check" CHECK (result IN ('pass', 'hold', 'fail')),
	CONSTRAINT "interview_recommendation_check" CHECK (recommendation IN ('hire', 'next_round', 'no_hire')),
	CONSTRAINT "interview_duration_check" CHECK (duration_minutes > 0),
	CONSTRAINT "interview_rating_check" CHECK (rating IS NULL OR rating BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "hiring"."interview_panelist" (
	"tenant_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_panelist_tenant_id_interview_id_user_id_pk" PRIMARY KEY("tenant_id","interview_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "hiring"."interview" ADD CONSTRAINT "interview_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "hiring"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."interview" ADD CONSTRAINT "interview_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "hiring"."candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."interview_panelist" ADD CONSTRAINT "interview_panelist_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "hiring"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_by_application" ON "hiring"."interview" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "interview_by_candidate" ON "hiring"."interview" USING btree ("tenant_id","candidate_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "interview_by_status_scheduled_at" ON "hiring"."interview" USING btree ("tenant_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "interview_panelist_by_user" ON "hiring"."interview_panelist" USING btree ("tenant_id","user_id");--> statement-breakpoint
ALTER TABLE "hiring"."candidate_event" DROP CONSTRAINT "candidate_event_kind_check";--> statement-breakpoint
ALTER TABLE "hiring"."candidate_event" ADD CONSTRAINT "candidate_event_kind_check" CHECK (kind IN ('created', 'stage_changed', 'hired', 'cancelled', 'rejected', 'transferred', 'rating_changed', 'note_changed', 'skills_changed', 'profile_changed', 'interview_scheduled', 'interview_rescheduled', 'interview_completed', 'interview_cancelled', 'interview_no_show'));
