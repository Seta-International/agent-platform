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
	CONSTRAINT "m365_group_links_status_check" CHECK (sync_status IN ('idle','pulling','pushing','error','conflict'))
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
CREATE UNIQUE INDEX "m365_group_links_uniq_group_live" ON "integrations"."m365_group_links" USING btree ("tenant_id","group_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_group_links_uniq_external_live" ON "integrations"."m365_group_links" USING btree ("tenant_id","external_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE INDEX "m365_group_links_by_status" ON "integrations"."m365_group_links" USING btree ("tenant_id","sync_status");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_subscriptions_uniq_tenant_resource" ON "integrations"."m365_subscriptions" USING btree ("tenant_id","resource");