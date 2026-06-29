CREATE TABLE "core"."feature_flag_exposure" (
	"flag_key" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"result" boolean NOT NULL,
	"last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_exposure_flag_key_user_id_pk" PRIMARY KEY("flag_key","user_id")
);
--> statement-breakpoint
CREATE TABLE "core"."feature_flags" (
	"key" text NOT NULL,
	"tenant_id" uuid,
	"strategies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "feature_flag_exposure_by_flag" ON "core"."feature_flag_exposure" USING btree ("tenant_id","flag_key");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_tenant_key" ON "core"."feature_flags" USING btree ("tenant_id","key") WHERE tenant_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_global_key" ON "core"."feature_flags" USING btree ("key") WHERE tenant_id IS NULL;