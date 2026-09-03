#!/usr/bin/env bash
set -euo pipefail

# Fill the Morale Trend tab with a year worth of ratings (FUT-786 AC5).
#
# The trend does not read morale_note at all — it reads people.morale_rating_aggregate,
# a separate store that carries no person_id and nothing finer than the month, so a trend
# query cannot be pointed at an individual. Seeding notes therefore does nothing for this
# tab; the ratings have to be written here.
#
# Every state the chart can be in is represented on purpose:
#   - a year that actually moves — high last autumn, a trough in April, recovering since,
#     so the line is worth reading rather than noise around a flat mean;
#   - one month under MIN_TREND_RESPONSES, which the tab must render as a response count
#     with no average (below four, a reader who knows the team could reconstruct scores);
#   - the current month with nothing in it yet, so the axis carries a visible gap rather
#     than stopping short.
#
# Rows are spread over the projects the TL leads, and carry those projects' accounts, so
# all three scopes have something to show: the org for HR/PMO/BoD, the account for an AM,
# the projects for a TL.
#
#   bash scripts/dev/seed-morale-trend.sh
#   RESET=1 bash scripts/dev/seed-morale-trend.sh    # drop earlier seeded ratings first
#   TL_EMAIL=... bash scripts/dev/seed-morale-trend.sh
#
# Dev only.

CONTAINER="${CONTAINER:-seta-ap-postgres-dev}"
DB_USER="${DB_USER:-seta}"
DB_NAME="${DB_NAME:-seta}"
TL_EMAIL="${TL_EMAIL:-cuong.le@example.com}"
AM_EMAIL="${AM_EMAIL:-am.hoa@seta-international.test}"
RESET="${RESET:-0}"

# Its own sentinel again. Real submissions leave org_unit_id null here, so a marked row is
# unmistakably seeded, and nothing on the trend path groups or filters by that column.
MARKER_ORG_UNIT='00000000-0000-4000-8000-5eed00000003'

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Postgres container '$CONTAINER' is not running — start it with 'pnpm db:up'." >&2
  exit 1
fi

run_sql() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"; }

if [ "$RESET" = "1" ]; then
  run_sql -q <<SQL
SET row_security = off;
DELETE FROM people.morale_rating_aggregate WHERE org_unit_id = '${MARKER_ORG_UNIT}';
SQL
  echo "Cleared previously seeded ratings."
fi

run_sql <<SQL
SET row_security = off;

WITH
tl AS (
  SELECT up.person_id, up.tenant_id
  FROM people.user_projection up
  JOIN identity."user" u ON u.id = up.user_id
  WHERE u.email = '${TL_EMAIL}'
),
am AS (
  SELECT up.person_id
  FROM people.user_projection up
  JOIN identity."user" u ON u.id = up.user_id
  WHERE u.email = '${AM_EMAIL}'
),
am_accounts AS (SELECT a.id FROM pm.account a, am WHERE a.am_person_id = am.person_id),
-- The projects the TL is on record as leading, with the account each sits under, so one
-- set of rows serves the project scope and the account scope at once.
led AS (
  SELECT DISTINCT w.project_id, w.account_id
  FROM people.worker_allocation_projection w, tl
  WHERE w.active AND w.lead_person_id = tl.person_id
),
-- Split in two so the AM's account gets a guaranteed half of every month rather than its
-- proportional share of the TL's whole portfolio. Only four of the eleven projects sit
-- under that account, and a plain round-robin left the AM on three responses a month —
-- under MIN_TREND_RESPONSES, so every point on their chart came back withheld and the tab
-- looked broken rather than private.
sides AS (
  SELECT 'focus'::text AS side, l.project_id, l.account_id,
         row_number() OVER (ORDER BY l.project_id) - 1 AS p,
         count(*) OVER () AS n
  FROM led l
  WHERE l.account_id IN (SELECT id FROM am_accounts)
  UNION ALL
  SELECT 'rest', l.project_id, l.account_id,
         row_number() OVER (ORDER BY l.project_id) - 1,
         count(*) OVER ()
  FROM led l
  WHERE l.account_id IS NULL OR l.account_id NOT IN (SELECT id FROM am_accounts)
),
-- Offsets back from the current month. 'resp' is how many people answered; 'target' is the
-- average their answers should land on, or NULL where the month is meant to stay blank.
--
-- Offset 2 is deliberately below MIN_TREND_RESPONSES (4): the tab has to say "3 responses"
-- and withhold the average, which is a state no amount of well-populated months exercises.
-- Offset 0 is the month in progress.
--
-- The counts are twice what one chart needs because each month is split between the two
-- scopes: a month has to clear four responses *after* halving, or the AM's chart is a row
-- of withheld points even though the org's looks healthy.
plan (off, resp, target) AS (VALUES
  ( 0,  0, NULL::numeric),
  ( 1, 14, 4.1),
  ( 2,  3, 2.9),
  ( 3, 16, 3.6),
  ( 4, 18, 3.1),
  ( 5, 20, 2.6),
  ( 6, 16, 2.8),
  ( 7, 14, 3.3),
  ( 8, 12, 3.9),
  ( 9, 12, 4.2),
  (10, 15, 4.4),
  (11, 13, 4.3)
),
-- Asia/Ho_Chi_Minh, matching vnYearMonth() on the read side: near a month boundary the
-- server's own clock and UTC disagree about which period a row belongs to.
months AS (
  SELECT pl.off, pl.resp, pl.target,
         to_char(
           date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')) - (pl.off || ' months')::interval,
           'YYYY-MM'
         ) AS period
  FROM plan pl
),
-- One row per response. The rating is built to land on the month's target rather than
-- drawn at random: floor and ceil in the proportion the fraction asks for, then a balanced
-- ±1 on every sixth and third response so a month is a spread of opinions and not two
-- values repeated. The two adjustments cancel, so the mean survives them.
-- Projects in the tenant the TL does not lead. Without a slice here the org-wide scope
-- would be the TL's own portfolio to the last decimal, and HR's chart would sit exactly on
-- top of the TL's — which reads as broken scoping rather than as two different questions.
outside AS (
  SELECT p.project_id, p.account_id,
         row_number() OVER (ORDER BY p.project_id) - 1 AS p,
         count(*) OVER () AS n
  FROM people.project_projection p, tl t
  WHERE p.tenant_id = t.tenant_id
    AND p.project_id NOT IN (SELECT project_id FROM led)
),
-- Two cohorts off one plan. 'outside' is smaller and rates higher, so the organisation
-- reads a little better than the team in trouble does — which is the whole reason a lead
-- is shown their own projects rather than the company average.
cohorts (cohort, share, lift) AS (VALUES ('led', 1.0, 0.0), ('outside', 0.45, 0.7)),
responses AS (
  SELECT
    m.period,
    c.cohort,
    k,
    least(5, greatest(1,
      floor(t.target)::int
      + CASE WHEN k::numeric / n.n < t.target - floor(t.target) THEN 1 ELSE 0 END
      + CASE k % 6 WHEN 0 THEN -1 WHEN 3 THEN 1 ELSE 0 END
    )) AS rating
  FROM months m
  CROSS JOIN cohorts c
  CROSS JOIN LATERAL (SELECT ceil(m.resp * c.share)::int AS n) n
  CROSS JOIN LATERAL (SELECT least(5.0, m.target + c.lift) AS target) t
  CROSS JOIN LATERAL generate_series(0, n.n - 1) AS k
  WHERE m.resp > 0
),
placed AS (
  -- Alternating sides, then cycling within each: every other led response lands on the
  -- AM's account, and neither side lets one project own a month.
  SELECT r.period, r.rating, s.project_id, s.account_id
  FROM responses r
  JOIN sides s
    ON s.side = CASE WHEN r.k % 2 = 0 THEN 'focus' ELSE 'rest' END
   AND s.p = (r.k / 2) % s.n
  WHERE r.cohort = 'led'
  UNION ALL
  SELECT r.period, r.rating, o.project_id, o.account_id
  FROM responses r
  JOIN outside o ON o.p = r.k % o.n
  WHERE r.cohort = 'outside'
),
inserted AS (
  INSERT INTO people.morale_rating_aggregate
    (tenant_id, org_unit_id, period, rating, project_id, account_id)
  SELECT t.tenant_id, '${MARKER_ORG_UNIT}', p.period, p.rating, p.project_id, p.account_id
  FROM placed p
  CROSS JOIN tl t
  RETURNING period, rating, project_id, account_id
)
-- Reported per scope, because "seeded 200 rows" says nothing about whether any of the
-- three tabs will draw a line. A blank average column is the privacy rule doing its job.
SELECT period,
       count(*) AS org_n,
       CASE WHEN count(*) >= 4 THEN round(avg(rating), 1) END AS org_avg,
       count(*) FILTER (WHERE project_id IN (SELECT project_id FROM led)) AS tl_n,
       CASE WHEN count(*) FILTER (WHERE project_id IN (SELECT project_id FROM led)) >= 4
            THEN round(avg(rating) FILTER (WHERE project_id IN (SELECT project_id FROM led)), 1)
       END AS tl_avg,
       count(*) FILTER (WHERE account_id IN (SELECT id FROM am_accounts)) AS am_n,
       CASE WHEN count(*) FILTER (WHERE account_id IN (SELECT id FROM am_accounts)) >= 4
            THEN round(avg(rating) FILTER (WHERE account_id IN (SELECT id FROM am_accounts)), 1)
       END AS am_avg
FROM inserted GROUP BY period ORDER BY period;
SQL

echo
echo "Seeded 12 months of ratings across the projects ${TL_EMAIL} leads."
echo "Re-run with RESET=1 to start over."
