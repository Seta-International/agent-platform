-- hand-written: drizzle-kit cannot emit this drop cleanly (its identity meta snapshots are stale, and the partial GIN index in 0011 is untracked); email_domains moved to core.tenants in PPL-3.
DROP INDEX IF EXISTS identity.tenant_sso_providers_domain_idx;

ALTER TABLE identity.tenant_sso_providers DROP COLUMN IF EXISTS email_domains;
