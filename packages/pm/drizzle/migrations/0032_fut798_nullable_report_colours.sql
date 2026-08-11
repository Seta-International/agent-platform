ALTER TABLE "pm"."flag" ALTER COLUMN "computed_colour" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."flag" ALTER COLUMN "final_colour" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pm"."report_revision" ALTER COLUMN "overall_colour" DROP NOT NULL;