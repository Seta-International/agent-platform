CREATE TABLE "identity"."access_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'custom' NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."access_group_membership" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_group_membership_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."access_group_role" (
	"group_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	CONSTRAINT "access_group_role_group_id_role_slug_pk" PRIMARY KEY("group_id","role_slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "access_group_tenant_slug" ON "identity"."access_group" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "access_group_membership_by_user" ON "identity"."access_group_membership" USING btree ("user_id");