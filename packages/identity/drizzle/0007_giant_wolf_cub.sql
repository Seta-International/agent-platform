CREATE TABLE "identity"."product_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"effect" text NOT NULL,
	"granted_by" uuid,
	"granted_via" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_grant_subject_product" ON "identity"."product_grant" USING btree ("subject_type","subject_id","product_id");