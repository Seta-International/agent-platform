CREATE TABLE "identity"."tenant_sso_providers" (
	"tenant_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"email_domains" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_sso_providers_tenant_id_provider_id_pk" PRIMARY KEY("tenant_id","provider_id")
);
