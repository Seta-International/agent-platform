CREATE TABLE "identity"."role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"granted_by" uuid,
	"granted_via" text DEFAULT 'admin' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
