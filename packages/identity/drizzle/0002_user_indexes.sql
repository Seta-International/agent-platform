-- hand-written: drizzle pgTable cannot express partial unique on lower(email)
CREATE UNIQUE INDEX user_tenant_email_uniq
  ON "identity"."user" (tenant_id, lower(email))
  WHERE deactivated_at IS NULL;

CREATE INDEX user_tenant_idx ON "identity"."user" (tenant_id);
