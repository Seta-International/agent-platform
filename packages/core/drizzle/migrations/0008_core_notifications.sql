CREATE TABLE "core"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"source_event_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "notifications_source_user_unique" UNIQUE("source_event_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "core"."notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "core"."notifications"."read_at" IS NULL AND "core"."notifications"."dismissed_at" IS NULL;