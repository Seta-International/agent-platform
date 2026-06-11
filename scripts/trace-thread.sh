#!/usr/bin/env bash
# Dump the full lifecycle of one chat turn / thread for debugging the agent:
# user+assistant messages (with tool-call vs text parts), the HITL approval
# rows + decisions, the Mastra workflow-snapshot status (suspended vs done),
# and the Mastra AI-tracing spans. Turns multi-query DB archaeology into one
# command.
#
# Usage:   scripts/trace-thread.sh <threadId>
#          scripts/trace-thread.sh            # lists the most recent threads
#
# Env:     PG_CONTAINER  (default: seta-ap-postgres-dev)
#          PG_USER/PG_DB (default: seta/seta)
set -euo pipefail

CONTAINER="${PG_CONTAINER:-seta-ap-postgres-dev}"
PG_USER="${PG_USER:-seta}"
PG_DB="${PG_DB:-seta}"

psql() { docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -X "$@"; }

THREAD="${1:-}"

if [[ -z "$THREAD" ]]; then
  echo "No threadId given — most recent threads:"
  psql -P pager=off -c "
    SELECT id, left(title,48) AS title, \"resourceId\", \"createdAt\"
      FROM agent.mastra_threads
     ORDER BY \"createdAt\" DESC
     LIMIT 15;"
  echo "Re-run: scripts/trace-thread.sh <id>"
  exit 0
fi

echo "════════════════════════════════════════════════════════════════"
echo " THREAD $THREAD"
echo "════════════════════════════════════════════════════════════════"

echo
echo "── MESSAGES (role · time · part-types · text) ──────────────────"
psql -P pager=off -c "
  SELECT to_char(\"createdAt\",'HH24:MI:SS') AS t,
         role,
         (SELECT string_agg(DISTINCT p->>'type', ',')
            FROM jsonb_array_elements(content::jsonb->'parts') p) AS parts,
         left(regexp_replace(
           coalesce((SELECT string_agg(p->>'text','')
                       FROM jsonb_array_elements(content::jsonb->'parts') p
                      WHERE p->>'type'='text'), ''),
           '\s+',' ','g'), 70) AS text
    FROM agent.mastra_messages
   WHERE thread_id = '$THREAD'
   ORDER BY \"createdAt\";"

echo "── HITL APPROVALS (status · decision · run) ────────────────────"
psql -P pager=off -c "
  SELECT to_char(created_at,'HH24:MI:SS') AS created,
         step_id, status,
         decision_payload->>'decision' AS decision,
         to_char(decided_at,'HH24:MI:SS') AS decided,
         mastra_run_id, tool_call_id
    FROM agent.workflow_approvals
   WHERE surface_chat_thread_id = '$THREAD'
   ORDER BY created_at;"

echo "── WORKFLOW SNAPSHOTS for this thread's runs (status tells suspend vs done) ──"
psql -P pager=off -c "
  WITH runs AS (
    SELECT DISTINCT mastra_run_id AS run_id
      FROM agent.workflow_approvals
     WHERE surface_chat_thread_id = '$THREAD' AND mastra_run_id IS NOT NULL
  )
  SELECT s.workflow_name,
         s.run_id,
         s.snapshot::jsonb->>'status' AS status,
         to_char(s.\"updatedAt\",'HH24:MI:SS') AS updated
    FROM agent.mastra_workflow_snapshot s
    JOIN runs USING (run_id)
   ORDER BY s.\"updatedAt\";"

echo "── AI-TRACING SPANS (enable @mastra/observability to populate) ──"
psql -P pager=off -c "
  SELECT to_char(\"startedAt\",'HH24:MI:SS') AS t,
         \"spanType\", name,
         CASE WHEN error IS NOT NULL THEN 'ERR' ELSE '' END AS err
    FROM agent.mastra_ai_spans
   WHERE \"threadId\" = '$THREAD'
   ORDER BY \"startedAt\"
   LIMIT 60;"
