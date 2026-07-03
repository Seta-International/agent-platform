CREATE SCHEMA "integrations";
--> statement-breakpoint
CREATE TABLE "integrations"."m365_group_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"delta_link" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_fields" jsonb NOT NULL,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"unlinked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_group_links_sync_status_check" CHECK (sync_status IN ('idle', 'pulling', 'pushing', 'error', 'conflict'))
);
--> statement-breakpoint
CREATE TABLE "integrations"."m365_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" text NOT NULL,
	"resource" text NOT NULL,
	"change_type" text NOT NULL,
	"expiration_at" timestamp with time zone NOT NULL,
	"client_state_hmac" text NOT NULL,
	"renewal_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations"."m365_plan_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"last_reconcile_at" timestamp with time zone,
	"unlinked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_plan_links_sync_status_check" CHECK (sync_status IN ('idle', 'pulling', 'pushing', 'error', 'conflict'))
);
--> statement-breakpoint
CREATE TABLE "integrations"."m365_resource_etags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_link_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"platform_id" text NOT NULL,
	"external_id" text NOT NULL,
	"etag" text NOT NULL,
	"last_synced_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_resource_etags_resource_type_check" CHECK (resource_type IN ('plan', 'planDetails', 'bucket', 'task', 'taskDetails', 'bucketTaskBoardTaskFormat', 'assignment'))
);
--> statement-breakpoint
CREATE TABLE "integrations"."m365_tenant_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"entra_tenant_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_blob" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
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
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "mail_transport_config_kind_check" CHECK (kind IN ('graph', 'smtp'))
);
--> statement-breakpoint
ALTER TABLE "integrations"."m365_resource_etags" ADD CONSTRAINT "m365_resource_etags_plan_link_id_m365_plan_links_id_fk" FOREIGN KEY ("plan_link_id") REFERENCES "integrations"."m365_plan_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_group_links_uniq_group_live" ON "integrations"."m365_group_links" USING btree ("tenant_id","group_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_group_links_uniq_external_live" ON "integrations"."m365_group_links" USING btree ("tenant_id","external_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE INDEX "m365_group_links_by_status" ON "integrations"."m365_group_links" USING btree ("tenant_id","sync_status");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_subscriptions_uniq_tenant_resource" ON "integrations"."m365_subscriptions" USING btree ("tenant_id","resource");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_plan_links_uniq_plan_live" ON "integrations"."m365_plan_links" USING btree ("tenant_id","plan_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_plan_links_uniq_external_live" ON "integrations"."m365_plan_links" USING btree ("tenant_id","external_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE INDEX "m365_plan_links_by_group_live" ON "integrations"."m365_plan_links" USING btree ("tenant_id","group_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_resource_etags_uniq" ON "integrations"."m365_resource_etags" USING btree ("tenant_id","plan_link_id","resource_type","platform_id");