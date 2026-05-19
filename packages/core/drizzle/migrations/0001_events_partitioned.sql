-- hand-written: drizzle pgTable cannot express PARTITION BY RANGE, deferred constraint
-- triggers, or pg_notify wiring. The corresponding typed schema lives in
-- src/db/schema/events.ts for read/write access.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE core.events (
  id                 uuid        NOT NULL,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  tenant_id          uuid        NOT NULL,
  aggregate_type     text        NOT NULL,
  aggregate_id       text        NOT NULL,
  event_type         text        NOT NULL,
  event_version      int         NOT NULL,
  payload            jsonb       NOT NULL,
  caused_by_user_id  uuid,
  caused_by_event_id uuid,
  trace_id           text,
  actor              jsonb,
  before             jsonb,
  after              jsonb,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX events_aggregate_idx ON core.events (aggregate_type, aggregate_id, occurred_at);
CREATE INDEX events_type_idx      ON core.events (event_type, event_version, occurred_at);
CREATE INDEX events_tenant_idx    ON core.events (tenant_id, occurred_at);

CREATE OR REPLACE FUNCTION core.ensure_events_partition(month_start date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  part_name  text := format('events_y%sm%s', to_char(month_start, 'YYYY'), to_char(month_start, 'MM'));
  next_month date := (month_start + interval '1 month')::date;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS core.%I PARTITION OF core.events FOR VALUES FROM (%L) TO (%L)',
    part_name, month_start, next_month
  );
END $$;

SELECT core.ensure_events_partition((date_trunc('month', now()) + (n || ' months')::interval)::date)
FROM generate_series(0, 12) AS n;

CREATE VIEW core.audit_v AS
  SELECT id AS event_id, occurred_at, tenant_id, event_type, actor, before, after, trace_id
  FROM core.events
  WHERE actor IS NOT NULL;

CREATE OR REPLACE FUNCTION core._notify_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_notify('events', ''); RETURN NULL; END $$;

CREATE CONSTRAINT TRIGGER events_notify
  AFTER INSERT ON core.events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION core._notify_events();
