ALTER TABLE "pm"."report" ADD COLUMN "risk_issue" text;--> statement-breakpoint
ALTER TABLE "pm"."report" ADD COLUMN "road_to_green" text;--> statement-breakpoint
ALTER TABLE "pm"."report" ADD COLUMN "road_to_green_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "pm"."report" ADD COLUMN "road_to_green_due" date;
--> statement-breakpoint
ALTER TABLE "pm"."comment" ADD COLUMN "author_name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "pm"."report" ADD COLUMN "declared_colours" jsonb;