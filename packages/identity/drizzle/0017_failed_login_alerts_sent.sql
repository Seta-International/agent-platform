CREATE TABLE "identity"."failed_login_alerts_sent" (
	"email" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL
);
