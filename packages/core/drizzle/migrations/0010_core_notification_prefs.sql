CREATE TABLE "core"."notification_prefs" (
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "notification_prefs_tenant_id_event_type_channel_pk" PRIMARY KEY("tenant_id","event_type","channel")
);
