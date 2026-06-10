CREATE TABLE "identity"."role_permission_overlays" (
	"tenant_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	"permission_key" text NOT NULL,
	"effect" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_overlays_tenant_id_role_slug_permission_key_pk" PRIMARY KEY("tenant_id","role_slug","permission_key")
);
