CREATE TABLE "copilot"."hitl_calls" (
	"call_id" varchar(64) PRIMARY KEY NOT NULL,
	"thread_id" varchar(64) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_name" varchar(128) NOT NULL,
	"input" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"outcome" jsonb,
	"required_permission" varchar(64) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot"."rate_limits" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_tenant_id_user_id_window_start_pk" PRIMARY KEY("tenant_id","user_id","window_start")
);
--> statement-breakpoint
CREATE INDEX "hitl_by_thread" ON "copilot"."hitl_calls" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "hitl_pending" ON "copilot"."hitl_calls" USING btree ("status","expires_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "rl_by_tenant_window" ON "copilot"."rate_limits" USING btree ("tenant_id","window_start");