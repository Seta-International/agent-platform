ALTER TABLE "hiring"."requisition_skill" DROP CONSTRAINT "requisition_skill_requisition_id_skill_name_pk";--> statement-breakpoint
ALTER TABLE "hiring"."requisition_skill" ALTER COLUMN "skill_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hiring"."requisition_skill" ADD CONSTRAINT "requisition_skill_requisition_id_skill_id_pk" PRIMARY KEY("requisition_id","skill_id");