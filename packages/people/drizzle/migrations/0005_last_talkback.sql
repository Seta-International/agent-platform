DROP INDEX "people"."person_by_tenant_user";--> statement-breakpoint
ALTER TABLE "people"."person" DROP COLUMN "user_id";