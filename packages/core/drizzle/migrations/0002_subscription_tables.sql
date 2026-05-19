-- hand-written: kept co-located with the bus DDL for review even though drizzle could
-- generate most of this. Co-location > generation when the file is load-bearing.

CREATE TABLE core.subscription_cursors (
  subscription            text PRIMARY KEY,
  last_processed_event_id uuid NOT NULL,
  last_processed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.subscription_processed (
  subscription text NOT NULL,
  event_id     uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription, event_id)
);

CREATE TABLE core.subscription_dead_letter (
  id               bigserial   PRIMARY KEY,
  subscription     text        NOT NULL,
  event_id         uuid        NOT NULL,
  event_type       text        NOT NULL,
  attempts         int         NOT NULL,
  last_error       text        NOT NULL,
  payload          jsonb       NOT NULL,
  first_failed_at  timestamptz NOT NULL,
  dead_lettered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription, event_id)
);
CREATE INDEX dlq_subscription_idx ON core.subscription_dead_letter (subscription, dead_lettered_at);
