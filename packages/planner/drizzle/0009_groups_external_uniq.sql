-- hand-written: drizzle-kit prompts for column conflicts in a non-TTY environment due to snapshot drift from prior hand-written migrations.
CREATE UNIQUE INDEX "groups_external_uniq"
  ON "planner"."groups" ("external_source", "external_id")
  WHERE external_source <> 'native' AND external_id IS NOT NULL AND deleted_at IS NULL;
