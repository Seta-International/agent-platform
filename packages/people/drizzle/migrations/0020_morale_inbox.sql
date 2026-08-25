-- Morale inbox for recipients (FUT-786) — hand-written for RLS policies + check constraints

-- Sender context, frozen at submit time (FUT-786).
--
-- The inbox groups notes by the sender's project, but a note is about a person, not a
-- project, and people move between projects. Deriving the group at read time would let
-- a transfer silently re-file notes someone already read, so the project is snapshotted
-- the same way `org_unit_id` and `full_name_snapshot` already are.
--
-- Every column is nullable: notes written before this migration have no snapshot, and a
-- sender with no active allocation legitimately has no project.
ALTER TABLE people.morale_note ADD COLUMN project_id uuid;
ALTER TABLE people.morale_note ADD COLUMN project_name_snapshot text;
ALTER TABLE people.morale_note ADD COLUMN account_id uuid;
ALTER TABLE people.morale_note ADD COLUMN sender_capacity text;

ALTER TABLE people.morale_note
  ADD CONSTRAINT morale_note_sender_capacity_check
  CHECK (sender_capacity IN ('member', 'tl'));

CREATE INDEX morale_note_by_project ON people.morale_note (tenant_id, project_id, submitted_at DESC);

-- Read state per recipient, not per note: HR is on every note, so a shared flag would let
-- HR clear the badge for a Team Lead who never opened it.
CREATE TABLE people.morale_note_read (
  note_id uuid NOT NULL REFERENCES people.morale_note(id) ON DELETE CASCADE,
  reader_person_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, reader_person_id)
);

CREATE INDEX morale_note_read_by_reader ON people.morale_note_read (reader_person_id);

-- RLS on child: no tenant_id of its own, so isolation joins through the parent note.
ALTER TABLE people.morale_note_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE people.morale_note_read FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON people.morale_note_read
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

-- Delivery dimensions on the anonymous store, so the trend can answer the scope a Team
-- Lead or Account Manager is entitled to without ever touching an identifiable row.
--
-- Still no person_id and still no timestamp finer than the month: what changes here is
-- how coarsely a rating can be grouped, not whether it can be traced. The
-- minimum-responses rule in the trend query is what keeps a small project unreadable.
ALTER TABLE people.morale_rating_aggregate ADD COLUMN project_id uuid;
ALTER TABLE people.morale_rating_aggregate ADD COLUMN account_id uuid;

CREATE INDEX morale_rating_by_project ON people.morale_rating_aggregate (tenant_id, project_id, period);
CREATE INDEX morale_rating_by_account ON people.morale_rating_aggregate (tenant_id, account_id, period);
