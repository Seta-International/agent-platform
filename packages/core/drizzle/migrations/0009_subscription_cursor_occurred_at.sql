ALTER TABLE "core"."subscription_cursors" ADD COLUMN "last_processed_occurred_at" timestamp with time zone DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;
