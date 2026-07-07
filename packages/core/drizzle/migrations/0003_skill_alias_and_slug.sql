CREATE TABLE "core"."skill_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."skill" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."skill_alias" ADD CONSTRAINT "skill_alias_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "core"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_alias_uniq_slug" ON "core"."skill_alias" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "skill_alias_by_skill" ON "core"."skill_alias" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE INDEX "skill_by_slug" ON "core"."skill" USING btree ("tenant_id","slug");--> statement-breakpoint
-- drizzle cannot model: RLS policies, grants, triggers
ALTER TABLE core.skill_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.skill_alias FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.skill_alias
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE TRIGGER skill_alias_touch_updated_at
BEFORE UPDATE ON core.skill_alias
FOR EACH ROW EXECUTE FUNCTION core.tg_touch_updated_at();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON core.skill_alias TO seta_app';
  END IF;
END $$;