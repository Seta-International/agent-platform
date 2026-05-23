-- hand-written: drops obsolete core tables after notifications module extraction
DROP TABLE IF EXISTS "core"."notifications";
--> statement-breakpoint
DROP TABLE IF EXISTS "core"."notification_prefs";
