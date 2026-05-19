-- hand-written: drizzle pgTable cannot express partial index on (user_id) WHERE invalidated_at IS NULL
CREATE INDEX session_scope_cache_user_idx
  ON core.session_scope_cache (user_id)
  WHERE invalidated_at IS NULL;
