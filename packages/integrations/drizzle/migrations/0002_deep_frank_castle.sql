CREATE TABLE "integrations"."m365_directory_conflict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"entra_oid" uuid,
	"detail" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" jsonb,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_directory_conflict_kind_check" CHECK (kind IN ('manager_ambiguous', 'email_collision', 'unit_delete_blocked', 'spine_collision', 'user_removed')),
	CONSTRAINT "m365_directory_conflict_subject_type_check" CHECK (subject_type IN ('person', 'org_unit')),
	CONSTRAINT "m365_directory_conflict_status_check" CHECK (status IN ('open', 'resolved', 'ignored'))
);
--> statement-breakpoint
CREATE TABLE "integrations"."m365_org_unit_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"entra_key" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_org_unit_links_kind_check" CHECK (kind IN ('division', 'department'))
);
--> statement-breakpoint
CREATE TABLE "integrations"."m365_person_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"entra_oid" uuid NOT NULL,
	"manager_oid" uuid,
	"department" text,
	"division" text,
	"photo_media_etag" text,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m365_person_links_sync_status_check" CHECK (sync_status IN ('idle', 'pulling', 'pushing', 'error', 'conflict'))
);
--> statement-breakpoint
ALTER TABLE "integrations"."m365_tenant_config" ADD COLUMN "directory_delta_link" text;--> statement-breakpoint
ALTER TABLE "integrations"."m365_tenant_config" ADD COLUMN "directory_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations"."m365_tenant_config" ADD COLUMN "directory_last_status" text;--> statement-breakpoint
ALTER TABLE "integrations"."m365_tenant_config" ADD COLUMN "directory_last_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "m365_directory_conflict_uniq_open" ON "integrations"."m365_directory_conflict" USING btree ("tenant_id","kind","subject_type","subject_id","entra_oid") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "m365_directory_conflict_by_status" ON "integrations"."m365_directory_conflict" USING btree ("tenant_id","status","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_org_unit_links_uniq_key" ON "integrations"."m365_org_unit_links" USING btree ("tenant_id","entra_key");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_org_unit_links_uniq_unit" ON "integrations"."m365_org_unit_links" USING btree ("tenant_id","org_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_person_links_uniq_oid" ON "integrations"."m365_person_links" USING btree ("tenant_id","entra_oid");--> statement-breakpoint
CREATE UNIQUE INDEX "m365_person_links_uniq_person" ON "integrations"."m365_person_links" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "m365_person_links_by_manager" ON "integrations"."m365_person_links" USING btree ("tenant_id","manager_oid");