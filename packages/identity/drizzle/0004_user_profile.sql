CREATE TABLE "identity"."user_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"ooo_until" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"working_hours" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
