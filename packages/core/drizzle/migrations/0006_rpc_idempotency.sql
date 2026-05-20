CREATE TABLE "core"."rpc_idempotency" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"method" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rpc_idempotency_key_idx" ON "core"."rpc_idempotency" USING btree ("idempotency_key");