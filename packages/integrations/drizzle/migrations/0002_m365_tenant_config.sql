CREATE TABLE "integrations"."m365_tenant_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"entra_tenant_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_blob" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
