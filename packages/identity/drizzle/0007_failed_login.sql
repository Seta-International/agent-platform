CREATE TABLE "identity"."failed_login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL
);
