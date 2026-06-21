CREATE TABLE "people"."person_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"level" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people"."person_skill" ADD CONSTRAINT "person_skill_person_fk" FOREIGN KEY ("person_id") REFERENCES "people"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_skill_uniq" ON "people"."person_skill" USING btree ("tenant_id","person_id","skill_id");--> statement-breakpoint
CREATE INDEX "person_skill_by_person" ON "people"."person_skill" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "person_skill_by_skill" ON "people"."person_skill" USING btree ("tenant_id","skill_id");