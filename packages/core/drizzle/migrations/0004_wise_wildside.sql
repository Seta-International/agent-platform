CREATE TABLE "core"."agent_eval_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"git_sha" text NOT NULL,
	"harness_version" text NOT NULL,
	"model_tier" text NOT NULL,
	"trigger" text NOT NULL,
	"judge_tokens_total" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."agent_eval_score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"specialist_id" text NOT NULL,
	"scorer_id" text NOT NULL,
	"layer" text NOT NULL,
	"score" real NOT NULL,
	"threshold" real NOT NULL,
	"passed" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."agent_eval_score" ADD CONSTRAINT "agent_eval_score_run_id_agent_eval_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "core"."agent_eval_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_eval_run_by_started" ON "core"."agent_eval_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "agent_eval_score_by_run" ON "core"."agent_eval_score" USING btree ("run_id");