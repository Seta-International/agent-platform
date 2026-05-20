CREATE TABLE "core"."outgoing_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"template" text NOT NULL,
	"to_address" text NOT NULL,
	"props_hash" text NOT NULL,
	"transport_kind" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"transport_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outgoing_emails_tenant_dedupe_idx" ON "core"."outgoing_emails" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "outgoing_emails_tenant_created_idx" ON "core"."outgoing_emails" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "outgoing_emails_pending_idx" ON "core"."outgoing_emails" USING btree ("status") WHERE status = 'pending';