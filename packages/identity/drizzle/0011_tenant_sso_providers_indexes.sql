-- hand-written: drizzle pgTable cannot express partial GIN index
CREATE INDEX tenant_sso_providers_domain_idx
  ON identity.tenant_sso_providers USING GIN (email_domains)
  WHERE enabled = true;
