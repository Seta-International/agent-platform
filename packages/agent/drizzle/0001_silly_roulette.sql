ALTER TABLE "agent"."workflow_approvals" ADD COLUMN "mastra_run_id" text;--> statement-breakpoint
ALTER TABLE "agent"."workflow_approvals" ADD COLUMN "tool_call_id" text;