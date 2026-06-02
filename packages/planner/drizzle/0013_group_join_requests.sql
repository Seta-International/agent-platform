-- hand-written: drizzle-kit prompts for table conflicts in a non-TTY environment due to snapshot drift from prior hand-written migrations.
CREATE TABLE "planner"."group_join_requests" (
  "group_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  CONSTRAINT "group_join_requests_pkey" PRIMARY KEY ("group_id", "user_id"),
  CONSTRAINT "join_requests_status_check" CHECK (status IN ('pending','approved','rejected'))
);

CREATE INDEX "join_requests_by_group_pending" ON "planner"."group_join_requests" ("group_id", "status");
CREATE INDEX "join_requests_by_user" ON "planner"."group_join_requests" ("user_id");
