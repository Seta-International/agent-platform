-- hand-written: drizzle pgTable cannot express function-expression index on lower(email)
CREATE INDEX failed_login_email_ip_idx
  ON identity.failed_login_attempts (lower(email), ip, attempted_at DESC);

CREATE INDEX failed_login_attempted_at_idx
  ON identity.failed_login_attempts (attempted_at);
