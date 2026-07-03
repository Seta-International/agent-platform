CREATE SCHEMA "knowledge";
--> statement-breakpoint
CREATE TABLE "knowledge"."files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"s3_key" text NOT NULL,
	"status" text NOT NULL,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"scan_at" timestamp with time zone,
	"scan_detail" text,
	"error_reason" text,
	"thread_id" uuid,
	"origin" text DEFAULT 'knowledge_base' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "files_origin_thread_check" CHECK ((origin = 'chat') = (thread_id IS NOT NULL)),
	CONSTRAINT "files_status_check" CHECK (status IN ('uploading', 'uploaded', 'consumed', 'parsing', 'embedding', 'ready', 'failed')),
	CONSTRAINT "files_scan_status_check" CHECK (scan_status IN ('pending', 'scanning', 'clean', 'infected', 'error')),
	CONSTRAINT "files_origin_check" CHECK (origin IN ('knowledge_base', 'chat'))
);
--> statement-breakpoint
CREATE INDEX "files_by_tenant" ON "knowledge"."files" USING btree ("tenant_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "files_by_thread" ON "knowledge"."files" USING btree ("tenant_id","thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_uniq_s3_key_per_tenant" ON "knowledge"."files" USING btree ("tenant_id","s3_key");--> statement-breakpoint
CREATE UNIQUE INDEX "files_tenant_id_id" ON "knowledge"."files" USING btree ("tenant_id","id");