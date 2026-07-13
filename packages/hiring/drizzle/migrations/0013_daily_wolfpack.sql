ALTER TABLE "hiring"."opening_close_reason" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hiring"."rejection_reason" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hiring"."application" DROP CONSTRAINT "application_rejection_reason_id_rejection_reason_id_fk";--> statement-breakpoint
ALTER TABLE "hiring"."opening" DROP CONSTRAINT "opening_close_reason_id_opening_close_reason_id_fk";--> statement-breakpoint
ALTER TABLE "hiring"."requisition" DROP CONSTRAINT "requisition_close_reason_id_opening_close_reason_id_fk";--> statement-breakpoint
DROP TABLE "hiring"."opening_close_reason" CASCADE;--> statement-breakpoint
DROP TABLE "hiring"."rejection_reason" CASCADE;--> statement-breakpoint
ALTER TABLE "hiring"."application" ADD CONSTRAINT "application_rejection_reason_id_reason_id_fk" FOREIGN KEY ("rejection_reason_id") REFERENCES "hiring"."reason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."opening" ADD CONSTRAINT "opening_close_reason_id_reason_id_fk" FOREIGN KEY ("close_reason_id") REFERENCES "hiring"."reason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring"."requisition" ADD CONSTRAINT "requisition_close_reason_id_reason_id_fk" FOREIGN KEY ("close_reason_id") REFERENCES "hiring"."reason"("id") ON DELETE no action ON UPDATE no action;
