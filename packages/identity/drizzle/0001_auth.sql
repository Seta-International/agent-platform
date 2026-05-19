-- hand-written: @better-auth/cli emits drizzle TS, not SQL; manually translated to schema-qualified DDL
CREATE TABLE "identity"."user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE "identity"."session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL REFERENCES "identity"."user"("id") ON DELETE CASCADE,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE INDEX "session_user_id_idx" ON "identity"."session" ("user_id");

CREATE TABLE "identity"."account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "identity"."user"("id") ON DELETE CASCADE,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamptz,
	"refresh_token_expires_at" timestamptz,
	"scope" text,
	"password" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "account_user_id_idx" ON "identity"."account" ("user_id");

CREATE TABLE "identity"."verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "verification_identifier_idx" ON "identity"."verification" ("identifier");

-- columns appended on top of better-auth's generated identity.user
ALTER TABLE "identity"."user" ADD COLUMN "tenant_id" uuid NOT NULL;
ALTER TABLE "identity"."user" ADD COLUMN "deactivated_at" timestamptz;
ALTER TABLE "identity"."user" ADD CONSTRAINT "user_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;
