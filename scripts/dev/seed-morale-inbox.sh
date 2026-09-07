#!/usr/bin/env bash
set -euo pipefail

# Fill one person's Notes Received tab with enough variety to exercise its states
# (FUT-786): six projects so the project pager appears, six notes each so the in-group
# pager appears too, unread outnumbering read, every recipient tag, and bodies long
# enough to hit the "+ more" truncation.
#
# Dev only. It writes straight into people.morale_note rather than going through
# submit-morale-note, because the surface under test is the *reading* one: the submit path
# can only produce notes addressed to whoever the sender's own project resolves to, which
# is exactly the variety this needs to sidestep.
#
#   bash scripts/dev/seed-morale-inbox.sh                        # default recipient
#   RECIPIENT=am.hoa@seta-international.test bash scripts/dev/seed-morale-inbox.sh
#   RESET=1 bash scripts/dev/seed-morale-inbox.sh                # drop earlier seeded notes first

CONTAINER="${CONTAINER:-seta-ap-postgres-dev}"
DB_USER="${DB_USER:-seta}"
DB_NAME="${DB_NAME:-seta}"
RECIPIENT="${RECIPIENT:-hr@example.com}"
RESET="${RESET:-0}"

# Stamped on every seeded note so RESET finds them again without touching real ones.
#
# Carried in org_unit_id rather than in the text: nothing on the morale read paths filters
# on that column — submit-morale-note writes it and the inbox never looks — so a sentinel
# there is invisible on screen, survives a note with no text at all, and cannot be
# mistaken for something the sender wrote.
MARKER_ORG_UNIT='00000000-0000-4000-8000-5eed00000001'

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Postgres container '$CONTAINER' is not running — start it with 'pnpm db:up'." >&2
  exit 1
fi

run_sql() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"; }

if [ "$RESET" = "1" ]; then
  run_sql -q <<SQL
SET row_security = off;
DELETE FROM people.morale_note WHERE org_unit_id = '${MARKER_ORG_UNIT}';
SQL
  echo "Cleared previously seeded notes."
fi

run_sql <<SQL
SET row_security = off;

WITH
-- Everything hangs off the recipient: their tenant scopes the notes, and senders and
-- projects are drawn from that same tenant so the inbox's own filters stay coherent.
recipient AS (
  SELECT up.person_id, up.tenant_id
  FROM people.user_projection up
  JOIN identity."user" u ON u.id = up.user_id
  WHERE u.email = '${RECIPIENT}'
),
-- Five real ones plus a sixth that is no project at all, so the tab's five-project page
-- leaves a "Show 1 more" behind it *and* the group for senders with no active allocation
-- has something in it. That group is not an edge case to tidy away: someone between
-- projects still has a morale note worth reading, and they are exactly the person whose
-- situation the empty grouping key describes.
projects AS (
  (
    SELECT p.project_id, p.name, p.account_id, row_number() OVER (ORDER BY p.name) AS n
    FROM people.project_projection p, recipient r
    WHERE p.tenant_id = r.tenant_id
    ORDER BY p.name
    LIMIT 5
  )
  UNION ALL
  SELECT NULL::uuid, NULL::text, NULL::uuid, 6
),
-- One person who is not the recipient, to hold the roles the viewer does not. Taken from
-- the far end of the name order so they rarely double as one of the senders below.
bystander AS (
  SELECT pe.id AS person_id, pe.full_name
  FROM people.person pe, recipient r
  WHERE pe.tenant_id = r.tenant_id AND pe.id <> r.person_id
  ORDER BY pe.full_name DESC
  LIMIT 1
),
-- Anyone but the recipient: a note from yourself is not something the inbox should show.
-- Seven, not six or eight: the project a note lands in is i % 6, so any sender count
-- sharing a factor with six would hand each project the same handful of names forever.
senders AS (
  SELECT pe.id AS person_id, row_number() OVER (ORDER BY pe.full_name) AS n
  FROM people.person pe, recipient r
  WHERE pe.tenant_id = r.tenant_id AND pe.id <> r.person_id
  LIMIT 7
),
-- Body 1 is a rating with no words at all, which the list has to render as "Rating only"
-- rather than as an empty row; body 4 is long enough to truncate behind "+ more".
bodies (n, body) AS (VALUES
  (1, NULL::text),
  (2, 'Sprint scope keeps moving after planning is closed.'),
  (3, 'Handover went well and the client signed off without a second round.'),
  (4, 'We have been running two sprints ahead of the agreed capacity since the scope was widened in June, and every estimate we gave the client before that change is now quietly wrong. Nobody has said no to the extra work, so it keeps arriving, and the team has absorbed it by cutting review time rather than by pushing anything back. The last three releases each went out with known issues we would normally have held for. I do not think anyone is acting in bad faith — the requests are reasonable one at a time — but together they add up to a quarter of unplanned work that never went through planning, and the people carrying it are the ones least able to say so.'),
  (5, 'Onboarding for the two new joiners took much longer than planned: the environment setup docs were out of date, so they spent most of their first week blocked on credentials rather than on the codebase.'),
  (6, 'Standups have drifted into status reporting for the client rather than a working session for the team, and the people who most need help asking for it are the quietest in them.'),
  (7, 'Release day keeps landing on a Friday afternoon and the on-call rota has the same two names on it every time. It has worked so far, which I think is the reason nobody has looked at it, but the last rollback ran past midnight and the person who took it was the same one who had covered the previous two. We are not short of people who could be on that rota; we are short of a reason to change it before something goes badly enough to force the question.')
),
tags (n, tag) AS (VALUES (1,'hr'),(2,'tl'),(3,'am'),(4,'pmo'),(5,'bod')),
-- 36 notes: six projects x six, spread back over about 26 days so they all land inside
-- the tab's default one-month window while still giving the date filter something to cut.
plan AS (
  SELECT
    i,
    p.project_id, p.name AS project_name, p.account_id,
    s.person_id AS sender_person_id,
    b.body,
    (i % 5) + 1 AS rating,
    CASE WHEN i % 4 = 0 THEN 'tl' ELSE 'member' END AS capacity,
    now() - (i * interval '18 hours') AS submitted_at,
    -- Two of every six read, counted along a project's own notes rather than along i:
    -- i % 3 would divide evenly into the i % 6 that picks the project, and hand out whole
    -- projects as read or unread instead of mixing the two inside each.
    ((i / 6) % 3 = 1) AS is_read
  FROM generate_series(0, 35) AS i
  JOIN projects p ON p.n = (i % 6) + 1
  JOIN senders s ON s.n = (i % 7) + 1
  -- Offset from the sender so the two do not move in lockstep, and out of step with the
  -- project so one project is not stuck with one body repeated six times.
  JOIN bodies b ON b.n = ((i + 3) % 7) + 1
),
inserted AS (
  INSERT INTO people.morale_note
    (tenant_id, person_id, org_unit_id, rating, concern_text, submitted_at,
     project_id, project_name_snapshot, account_id, sender_capacity)
  SELECT r.tenant_id, pl.sender_person_id, '${MARKER_ORG_UNIT}', pl.rating, pl.body,
         pl.submitted_at, pl.project_id, pl.project_name, pl.account_id, pl.capacity
  FROM plan pl, recipient r
  RETURNING id, submitted_at
),
-- Re-joined on submitted_at, which is unique across the plan: RETURNING cannot carry the
-- plan's own columns out of the INSERT.
linked AS (
  SELECT ins.id, pl.i, pl.is_read
  FROM inserted ins JOIN plan pl ON pl.submitted_at = ins.submitted_at
),
-- One to three tags per note that the recipient themselves holds: every note is
-- genuinely addressed to this person rather than merely labelled.
mine_tags AS (
  SELECT l.id AS note_id, l.i, t.tag
  FROM linked l
  CROSS JOIN LATERAL generate_series(0, l.i % 3) AS k
  JOIN tags t ON t.n = ((l.i + k) % 5) + 1
),
-- One more role per note, held by somebody else. Without it every tag on screen is one
-- the viewer holds, and the difference the UI draws between "yours" and "also told" has
-- nothing to show. Skipped where the role picked is already the recipient's.
other_tags AS (
  SELECT m.note_id, t.tag
  FROM (SELECT DISTINCT note_id, i FROM mine_tags) m
  JOIN tags t ON t.n = ((m.i + 4) % 5) + 1
  WHERE NOT EXISTS (
    SELECT 1 FROM mine_tags mt WHERE mt.note_id = m.note_id AND mt.tag = t.tag
  )
),
tagged AS (
  INSERT INTO people.morale_note_recipient
    (note_id, recipient_person_id, recipient_tag, full_name_snapshot)
  SELECT mt.note_id, r.person_id, mt.tag, pe.full_name
  FROM mine_tags mt
  CROSS JOIN recipient r
  JOIN people.person pe ON pe.id = r.person_id
  UNION ALL
  SELECT ot.note_id, b.person_id, ot.tag, b.full_name
  FROM other_tags ot
  CROSS JOIN bystander b
  RETURNING note_id
)
INSERT INTO people.morale_note_read (note_id, reader_person_id)
SELECT l.id, r.person_id FROM linked l, recipient r WHERE l.is_read;

-- DISTINCT because one note carries up to three recipient rows for the same person, one
-- per tag it reached them under.
SELECT n.project_name_snapshot AS project,
       count(DISTINCT n.id) AS notes,
       count(DISTINCT n.id) FILTER (WHERE rd.note_id IS NULL) AS unread
FROM people.morale_note n
JOIN people.morale_note_recipient mr ON mr.note_id = n.id
JOIN people.user_projection up ON up.person_id = mr.recipient_person_id
JOIN identity."user" u ON u.id = up.user_id
LEFT JOIN people.morale_note_read rd ON rd.note_id = n.id AND rd.reader_person_id = mr.recipient_person_id
WHERE u.email = '${RECIPIENT}'
GROUP BY 1 ORDER BY 1;
SQL

echo
echo "Seeded notes for ${RECIPIENT}. Re-run with RESET=1 to start over."
