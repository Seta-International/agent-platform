CREATE TABLE "core"."mutation_idempotency" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"mutation_kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutation_idempotency_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE INDEX "mutation_idempotency_tenant_created_idx" ON "core"."mutation_idempotency" USING btree ("tenant_id","created_at");