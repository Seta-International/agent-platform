CREATE TABLE "integrations"."m365_resource_etags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_link_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"platform_id" text NOT NULL,
	"external_id" text NOT NULL,
	"etag" text NOT NULL,
	"last_synced_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_resource_etags_resource_type_check" CHECK (resource_type IN ('plan','planDetails','bucket','task','taskDetails','bucketTaskBoardTaskFormat','assignment'))
);
--> statement-breakpoint
ALTER TABLE "integrations"."m365_resource_etags" ADD CONSTRAINT "m365_resource_etags_plan_link_id_m365_plan_links_id_fk" FOREIGN KEY ("plan_link_id") REFERENCES "integrations"."m365_plan_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_resource_etags_uniq" ON "integrations"."m365_resource_etags" USING btree ("tenant_id","plan_link_id","resource_type","platform_id");