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
	CONSTRAINT "m365_plan_links_status_check" CHECK (sync_status IN ('idle','pulling','pushing','error','conflict'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "m365_plan_links_uniq_plan_live" ON "integrations"."m365_plan_links" USING btree ("tenant_id","plan_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_plan_links_uniq_external_live" ON "integrations"."m365_plan_links" USING btree ("tenant_id","external_id") WHERE unlinked_at IS NULL;--> statement-breakpoint
CREATE INDEX "m365_plan_links_by_group_live" ON "integrations"."m365_plan_links" USING btree ("tenant_id","group_id") WHERE unlinked_at IS NULL;
