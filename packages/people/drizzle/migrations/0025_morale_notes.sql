-- Morale notes (FUT-782) — hand-written for RLS policies + check constraints

CREATE TABLE people.morale_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES people.person(id),
  org_unit_id uuid,
  rating integer NOT NULL,
  concern_text text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT morale_note_rating_range CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX morale_note_by_person ON people.morale_note (tenant_id, person_id, submitted_at DESC);

ALTER TABLE people.morale_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.morale_note FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.morale_note
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE people.morale_note_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES people.morale_note(id) ON DELETE CASCADE,
  recipient_person_id uuid NOT NULL,
  recipient_tag text NOT NULL,
  full_name_snapshot text,
  CONSTRAINT morale_note_recipient_recipient_tag_check CHECK (recipient_tag IN ('hr', 'tl', 'am', 'pmo', 'bod'))
);

CREATE INDEX morale_recipient_by_note ON people.morale_note_recipient (note_id);
CREATE INDEX morale_recipient_by_person ON people.morale_note_recipient (recipient_person_id);

-- RLS on child: no tenant_id of its own, so isolation joins through the parent note.
ALTER TABLE people.morale_note_recipient ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.morale_note_recipient FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.morale_note_recipient
  USING (EXISTS (
    SELECT 1 FROM people.morale_note n
    WHERE n.id = note_id
      AND n.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM people.morale_note n
    WHERE n.id = note_id
      AND n.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));

-- Ratings live apart from the identifiable note (AC4): no person_id, no note_id, and
-- no timestamp finer than the month, so a rating cannot be correlated back to its author.
CREATE TABLE people.morale_rating_aggregate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  org_unit_id uuid,
  period text NOT NULL,
  rating integer NOT NULL,
  CONSTRAINT morale_rating_aggregate_range CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT morale_rating_aggregate_period CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE INDEX morale_rating_by_period ON people.morale_rating_aggregate (tenant_id, period);
CREATE INDEX morale_rating_by_org_unit ON people.morale_rating_aggregate (tenant_id, org_unit_id, period);

ALTER TABLE people.morale_rating_aggregate ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.morale_rating_aggregate FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.morale_rating_aggregate
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
