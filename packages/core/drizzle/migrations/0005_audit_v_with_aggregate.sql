-- hand-written: drizzle pgTable cannot model VIEW DDL; DROP+CREATE required because
-- CREATE OR REPLACE VIEW cannot add columns in a different position than the existing view.
DROP VIEW IF EXISTS core.audit_v;
CREATE VIEW core.audit_v AS
  SELECT
    id AS event_id,
    occurred_at,
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor,
    payload,
    before,
    after,
    trace_id
  FROM core.events
  WHERE actor IS NOT NULL;
