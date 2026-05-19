-- hand-written: drizzle pgTable cannot express partial unique with COALESCE expression
CREATE UNIQUE INDEX role_grants_active_uniq
  ON identity.role_grants (user_id, role_slug, scope_type, COALESCE(scope_id, '-'))
  WHERE revoked_at IS NULL;

CREATE INDEX role_grants_user_idx
  ON identity.role_grants (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX role_grants_tenant_role_idx
  ON identity.role_grants (tenant_id, role_slug)
  WHERE revoked_at IS NULL;
