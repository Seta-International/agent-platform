-- RLS cannot model session_scope_cache: it is auth infra keyed by session_id and
-- read in getSessionScope BEFORE the tenant is known, so a tenant_id RLS check can
-- never be satisfied (the seta_app web pool has no app.tenant_id GUC yet). This
-- matches better-auth's identity.session, which is intentionally not RLS'd. Drop
-- the tenant policy and disable RLS so the web pool can read/write the cache.
DROP POLICY IF EXISTS tenant_isolation ON core.session_scope_cache;
ALTER TABLE core.session_scope_cache NO FORCE ROW LEVEL SECURITY;
ALTER TABLE core.session_scope_cache DISABLE ROW LEVEL SECURITY;
