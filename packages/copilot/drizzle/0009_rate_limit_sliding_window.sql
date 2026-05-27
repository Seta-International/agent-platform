ALTER TABLE "copilot"."rate_limits"
  ALTER COLUMN "window_start" TYPE timestamp(0) with time zone
  USING date_trunc('second', "window_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rl_cleanup_window" ON "copilot"."rate_limits" USING btree ("window_start");
