#!/usr/bin/env bash
set -euo pipefail

# Fill the Notes Received tab for a Team Lead and an Account Manager (FUT-786).
#
# The sibling script, seed-morale-inbox.sh, addresses every note to one person under every
# tag at once, which exercises the list's states but says nothing about the two capacities
# that are *earned* rather than granted: a TL reviews because they lead a project, an AM
# because they own an account. Those two come from real rows — worker_allocation_projection
# .lead_person_id and pm.account.am_person_id — so a note that merely carries the tag would
# still leave both tabs shut.
#
# Every note here is one submit-morale-note could genuinely have produced: the sender is a
# member actually allocated to the project, the `tl` recipient is that project's own lead,
# and the `am` recipient is that account's own AM. HR is on all of them, as it always is.
#
#   bash scripts/dev/seed-morale-tl-am.sh
#   RESET=1 bash scripts/dev/seed-morale-tl-am.sh    # drop earlier seeded notes first
#   TL_EMAIL=... AM_EMAIL=... bash scripts/dev/seed-morale-tl-am.sh
#
# Dev only.

CONTAINER="${CONTAINER:-seta-ap-postgres-dev}"
DB_USER="${DB_USER:-seta}"
DB_NAME="${DB_NAME:-seta}"
TL_EMAIL="${TL_EMAIL:-cuong.le@example.com}"
AM_EMAIL="${AM_EMAIL:-am.hoa@seta-international.test}"
HR_EMAIL="${HR_EMAIL:-hr@example.com}"
RESET="${RESET:-0}"

# Its own sentinel, distinct from seed-morale-inbox.sh's, so RESET here does not clear that
# script's notes and vice versa. Carried in org_unit_id because nothing on the morale read
# paths filters on that column, so it never reaches the screen.
MARKER_ORG_UNIT='00000000-0000-4000-8000-5eed00000002'

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
  echo "Cleared previously seeded TL/AM notes."
fi

# Both tabs sit behind people.performance.read, which only people.viewer and people.manager
# carry. Leading a project earns the *scope*, not the permission — so without this the TL
# gets a 403 before resolveMoraleReviewerScope is ever consulted, and the seeded notes are
# invisible for a reason that has nothing to do with the data.
#
# people.viewer rather than people.manager: manager is an org-wide role, and an org-wide
# role short-circuits the scope resolver to `{kind:'org'}` — which would hand the TL the
# whole organisation's trend and defeat the point of logging in as one.
run_sql -q <<SQL
SET row_security = off;
INSERT INTO identity.role_assignments (user_id, tenant_id, role_slug, scope_kind, granted_via)
SELECT u.id, u.tenant_id, 'people.viewer', 'self', 'cli'
FROM identity."user" u
WHERE u.email IN ('${TL_EMAIL}', '${AM_EMAIL}')
  AND NOT EXISTS (
    SELECT 1 FROM identity.role_assignments ra
    WHERE ra.user_id = u.id AND ra.role_slug = 'people.viewer' AND ra.revoked_at IS NULL
  );
SQL

run_sql <<SQL
SET row_security = off;

WITH
tl AS (
  SELECT up.person_id, up.tenant_id, pe.full_name
  FROM people.user_projection up
  JOIN identity."user" u ON u.id = up.user_id
  JOIN people.person pe ON pe.id = up.person_id
  WHERE u.email = '${TL_EMAIL}'
),
am AS (
  SELECT up.person_id, pe.full_name
  FROM people.user_projection up
  JOIN identity."user" u ON u.id = up.user_id
  JOIN people.person pe ON pe.id = up.person_id
  WHERE u.email = '${AM_EMAIL}'
),
hr AS (
  SELECT up.person_id, pe.full_name
  FROM people.user_projection up
  JOIN identity."user" u ON u.id = up.user_id
  JOIN people.person pe ON pe.id = up.person_id
  WHERE u.email = '${HR_EMAIL}'
),
-- The projects the TL is on record as leading, not a sample of projects we then claim they
-- lead. If this comes back empty the seed writes nothing, which is the honest outcome: the
-- account named in TL_EMAIL is not a Team Lead.
led AS (
  SELECT DISTINCT w.project_id, w.account_id
  FROM people.worker_allocation_projection w, tl
  WHERE w.active AND w.lead_person_id = tl.person_id
),
owned AS (
  SELECT a.id AS account_id FROM pm.account a, am WHERE a.am_person_id = am.person_id
),
-- Senders are the people allocated to those projects, minus the lead: a note addressed to
-- your own lead is the case under test, a note you addressed to yourself is not.
cand AS (
  SELECT DISTINCT w.project_id, w.account_id, w.person_id AS sender_person_id
  FROM people.worker_allocation_projection w
  JOIN led l ON l.project_id = w.project_id
  CROSS JOIN tl
  WHERE w.active AND w.person_id <> tl.person_id
),
-- Ordered by project so the account-owned ones do not all land at one end of the date
-- range, then numbered: the plan below indexes bodies and read state off this.
numbered AS (
  SELECT c.*, row_number() OVER (ORDER BY c.project_id, c.sender_person_id) - 1 AS i
  FROM cand c
),
bodies (n, body) AS (VALUES
  (1, NULL::text),
  (2, 'Estimates for this sprint were set before the extra scope landed and nobody has revised them.'),
  (3, 'The client call went well and the team got credit for it in front of the account.'),
  (4, 'We have been running two sprints ahead of the agreed capacity since the scope was widened in June, and every estimate we gave the client before that change is now quietly wrong. Nobody has said no to the extra work, so it keeps arriving, and the team has absorbed it by cutting review time rather than by pushing anything back. The last three releases each went out with known issues we would normally have held for. I do not think anyone is acting in bad faith — the requests are reasonable one at a time — but together they add up to a quarter of unplanned work that never went through planning, and the people carrying it are the ones least able to say so.'),
  (5, 'Two people on this project have been covering the on-call rota between them since May.'),
  (6, 'Handover notes are thorough but they arrive the day someone leaves, which is too late to ask questions about them.'),
  (7, 'Standups have turned into status reporting for the account rather than a working session, and the people who most need help asking for it are the quietest in them.')
),
plan AS (
  SELECT
    n.i, n.project_id, n.account_id, n.sender_person_id, b.body,
    p.name AS project_name,
    (n.i % 5) + 1 AS rating,
    CASE WHEN n.i % 5 = 0 THEN 'tl' ELSE 'member' END AS capacity,
    now() - (n.i * interval '11 hours') AS submitted_at
  FROM numbered n
  JOIN people.project_projection p ON p.project_id = n.project_id
  JOIN bodies b ON b.n = (n.i % 7) + 1
),
inserted AS (
  INSERT INTO people.morale_note
    (tenant_id, person_id, org_unit_id, rating, concern_text, submitted_at,
     project_id, project_name_snapshot, account_id, sender_capacity)
  SELECT t.tenant_id, pl.sender_person_id, '${MARKER_ORG_UNIT}', pl.rating, pl.body,
         pl.submitted_at, pl.project_id, pl.project_name, pl.account_id, pl.capacity
  FROM plan pl, tl t
  RETURNING id, submitted_at, account_id
),
-- Re-joined on submitted_at, which is unique across the plan: RETURNING cannot carry the
-- plan's own columns out of the INSERT.
linked AS (
  SELECT ins.id, ins.account_id, pl.i
  FROM inserted ins JOIN plan pl ON pl.submitted_at = ins.submitted_at
),
tagged AS (
  INSERT INTO people.morale_note_recipient
    (note_id, recipient_person_id, recipient_tag, full_name_snapshot)
  -- HR on every note, as the product guarantees.
  SELECT l.id, h.person_id, 'hr', h.full_name FROM linked l, hr h
  UNION ALL
  SELECT l.id, t.person_id, 'tl', t.full_name FROM linked l, tl t
  UNION ALL
  -- Only where the note's account is one this AM actually owns, so the AM's inbox is the
  -- subset of the TL's that runs through their account rather than a copy of it.
  SELECT l.id, a.person_id, 'am', a.full_name
  FROM linked l JOIN owned o ON o.account_id = l.account_id, am a
  RETURNING note_id
)
-- Read state is per (note, reader), so the two inboxes are marked on different notes: the
-- same note can sit unread for the AM while the TL has already cleared it, which is what
-- the column means and what the unread counts have to survive.
INSERT INTO people.morale_note_read (note_id, reader_person_id)
SELECT l.id, t.person_id FROM linked l, tl t WHERE l.i % 3 = 0
UNION ALL
SELECT l.id, a.person_id FROM linked l JOIN owned o ON o.account_id = l.account_id, am a
WHERE l.i % 4 = 1;

SELECT u.email,
       mr.recipient_tag AS as_role,
       count(DISTINCT n.id) AS notes,
       count(DISTINCT n.id) FILTER (WHERE rd.note_id IS NULL) AS unread
FROM people.morale_note n
JOIN people.morale_note_recipient mr ON mr.note_id = n.id
JOIN people.user_projection up ON up.person_id = mr.recipient_person_id
JOIN identity."user" u ON u.id = up.user_id
LEFT JOIN people.morale_note_read rd
  ON rd.note_id = n.id AND rd.reader_person_id = mr.recipient_person_id
WHERE n.org_unit_id = '${MARKER_ORG_UNIT}'
GROUP BY 1, 2 ORDER BY 1, 2;
SQL

echo
echo "Seeded. Sign in as ${TL_EMAIL} (Team Lead) or ${AM_EMAIL} (Account Manager)."
echo "Re-run with RESET=1 to start over."
