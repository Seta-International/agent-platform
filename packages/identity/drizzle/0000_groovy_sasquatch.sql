CREATE SCHEMA "identity";
--> statement-breakpoint
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_group_kind_check" CHECK (kind IN ('default', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "identity"."access_group_membership" (
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_group_membership_tenant_id_group_id_user_id_pk" PRIMARY KEY("tenant_id","group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."access_group_role" (
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	"scope_kind" text DEFAULT 'tenant' NOT NULL,
	"scope_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	CONSTRAINT "access_group_role_tenant_id_group_id_role_slug_scope_kind_scope_id_pk" PRIMARY KEY("tenant_id","group_id","role_slug","scope_kind","scope_id"),
	CONSTRAINT "access_group_role_scope_kind_check" CHECK (scope_kind IN ('tenant', 'org_unit', 'self')),
	CONSTRAINT "access_group_role_scope_check" CHECK ((scope_kind = 'org_unit') = (scope_id <> '00000000-0000-0000-0000-000000000000'))
);
--> statement-breakpoint
CREATE TABLE "identity"."failed_login_alerts_sent" (
	"email" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."failed_login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."org_unit_projection" (
	"org_unit_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."person_projection" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"work_email" text,
	"job_title" text,
	"employment_status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_projection_employment_status_check" CHECK (employment_status IN ('active', 'terminated'))
);
--> statement-breakpoint
CREATE TABLE "identity"."product_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"effect" text NOT NULL,
	"granted_by" uuid,
	"granted_via" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_grant_subject_type_check" CHECK (subject_type IN ('tenant', 'group', 'user')),
	CONSTRAINT "product_grant_effect_check" CHECK (effect IN ('grant', 'revoke')),
	CONSTRAINT "product_grant_granted_via_check" CHECK (granted_via IN ('admin', 'seed', 'cli'))
);
--> statement-breakpoint
CREATE TABLE "identity"."role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	"scope_kind" text DEFAULT 'tenant' NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid,
	"granted_via" text DEFAULT 'admin' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "role_assignments_scope_kind_check" CHECK (scope_kind IN ('tenant', 'org_unit', 'self')),
	CONSTRAINT "role_assignments_granted_via_check" CHECK (granted_via IN ('admin', 'cli', 'idp')),
	CONSTRAINT "role_assignments_scope_check" CHECK ((scope_kind = 'org_unit' AND scope_id IS NOT NULL) OR (scope_kind IN ('tenant','self') AND scope_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "identity"."role_permission_overlays" (
	"tenant_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	"permission_key" text NOT NULL,
	"effect" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_overlays_tenant_id_role_slug_permission_key_pk" PRIMARY KEY("tenant_id","role_slug","permission_key"),
	CONSTRAINT "role_permission_overlays_effect_check" CHECK (effect IN ('grant', 'revoke'))
);
--> statement-breakpoint
CREATE TABLE "identity"."tenant_sso_providers" (
	"tenant_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_sso_providers_tenant_id_provider_id_pk" PRIMARY KEY("tenant_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "identity"."session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "identity"."user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deactivated_at" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_group_tenant_slug" ON "identity"."access_group" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "access_group_membership_by_tenant" ON "identity"."access_group_membership" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "access_group_membership_by_user" ON "identity"."access_group_membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "access_group_role_by_tenant" ON "identity"."access_group_role" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "failed_login_attempted_at_idx" ON "identity"."failed_login_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "failed_login_email_ip_idx" ON "identity"."failed_login_attempts" USING btree (lower("email"),"ip","attempted_at" DESC);--> statement-breakpoint
CREATE INDEX "org_unit_projection_by_tenant" ON "identity"."org_unit_projection" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "person_projection_by_tenant" ON "identity"."person_projection" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_grant_subject_product" ON "identity"."product_grant" USING btree ("tenant_id","subject_type","subject_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_active_unique" ON "identity"."role_assignments" USING btree ("tenant_id","user_id","role_slug","scope_kind",COALESCE(scope_id::text, '')) WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "role_assignment_by_user" ON "identity"."role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "identity"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "identity"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_tenant_idx" ON "identity"."user" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_email_uniq" ON "identity"."user" USING btree ("tenant_id",lower("email")) WHERE "identity"."user"."deactivated_at" IS NULL;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "identity"."verification" USING btree ("identifier");