CREATE SCHEMA "integrations";
--> statement-breakpoint
CREATE TABLE "integrations"."mail_transport_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"sender_address" text NOT NULL,
	"sender_display_name" text,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verify_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint NOT NULL
);
