-- hand-written: drizzle pgTable cannot express partial index with WHERE clause
CREATE INDEX IF NOT EXISTS workflow_approvals_pending_expires_idx
  ON copilot.workflow_approvals (expires_at)
  WHERE status = 'pending';
