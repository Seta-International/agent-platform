CREATE TABLE "identity"."user_skill_embeddings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"embedding" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
