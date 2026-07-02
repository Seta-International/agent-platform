-- drizzle-kit does not emit a USING clause for text->uuid column type changes; added by hand.
DROP INDEX "identity"."role_assignment_active_unique";--> statement-breakpoint
ALTER TABLE "identity"."role_assignments" ALTER COLUMN "scope_id" SET DATA TYPE uuid USING "scope_id"::uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_active_unique" ON "identity"."role_assignments" USING btree ("tenant_id","user_id","role_slug","scope_kind",COALESCE(scope_id::text, '')) WHERE revoked_at IS NULL;