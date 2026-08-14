# FUT-840 manual smoke

Closes the one gap no automated test spans: model → card → HTTP confirm → task
changed. Ten minutes, run once before the PR merges.

The gap is real and pre-existing, not new to this ticket. The invariant matrix
(`apps/server/tests/integration/action-revision-invariants.test.ts`) proves the
card is right; the resume suite
(`packages/agent/tests/integration/routes.chat-resume.test.ts`) proves confirming
that card produces the right write. They meet at the persisted card, and nothing
without a model proves the *assistant* emits it. FUT-804's plan records the same
gap. It closes properly once FUT-807's change-flow lane exists — see
[`fut840-revision-golden-cases.md`](./fut840-revision-golden-cases.md).

Setup: `pnpm db:up && pnpm db:migrate && bash scripts/dev/tenant-bootstrap.sh && pnpm dev`.
Debug a turn with `scripts/dev/trace-thread.sh <threadId>`; app logs are NDJSON in
`logs/{server,worker}.log`.

1. In chat: "đổi due date của task Deploy API sang 15/08 và priority Urgent".
   → One preview card showing BOTH changes.
2. "à cho sang thứ Sáu tuần sau".
   → The first card collapses to "Superseded — Replaced by an updated preview."
   → A new card shows the NEW date AND still shows Urgent.
   → A2's sentence names the task.
3. Confirm the new card.
   → The task shows the new due date and Urgent.
   → `SELECT count(*) FROM core.mutation_idempotency WHERE tenant_id = …` is 1,
     not 2 — only one gateway call ever happened.
4. Reload the page and press Confirm on the collapsed card via its stale state
   (or replay the request from the network tab).
   → 409 `superseded`, and the task is unchanged.
5. Repeat step 1, then type "create a task for the release notes".
   → TWO cards are pending, and the first is still confirmable.
6. Repeat step 1, then type "và giao cho Tuấn nữa".
   → No second card. A2 asks you to confirm or cancel first.
   → The update preview is still confirmable.
7. Repeat step 1, then type "không phải, chỉ đổi ngày quá hạn sang ngày mai thôi".
   → The first card collapses to Superseded.
   → The new card shows the new date and NO priority row.
   → No "confirm or cancel first" sentence appears anywhere.
   → A2's sentence quotes the weekday the tool returned — check it against
     `TZ=Asia/Bangkok date -d <the date> +%A`.

8. Repeat step 1, then type "À thôi đổi sang 19/8 đi", then "đúng".
   → The first card collapses to Superseded, a new card shows 19/08.
   → A2 never asks you to confirm the change in words, and never offers to cancel
     the old proposal.
   → The "đúng" turn points you at the card's Confirm button instead of re-asking.

   This is the turn that failed on 14/08: A2 read the preview correctly and then
   emitted text without calling any tool, four turns running, so no second card
   could exist. Nothing below the model was broken — which is why the check is
   "did a tool run at all".

Inspect rows with
`docker exec seta-ap-postgres-dev psql -U seta -d seta -c '<SQL>'`.

## Did the model actually call a tool?

Already recorded — `MastraStorageExporter` writes a span tree per turn, so a turn
that narrated instead of acting is a query, not a missing metric. Any row here is
step 8's failure mode:

```sql
SELECT r."startedAt", r."threadId"
FROM agent.mastra_ai_spans r
WHERE r."spanType" = 'agent_run'
  AND r.name LIKE '%planner.action%'
  AND NOT EXISTS (
    SELECT 1 FROM agent.mastra_ai_spans t
    WHERE t."traceId" = r."traceId" AND t."spanType" = 'tool_call'
  )
ORDER BY r."startedAt" DESC;
```

A legitimate hit exists — A2 asking which task the user meant, or refusing
something it cannot do — so read the turn before judging it. What is never
legitimate is a hit whose turn had an OPEN PREVIEW and a user sentence naming a
new value.
