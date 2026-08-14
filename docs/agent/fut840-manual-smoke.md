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

Inspect rows with
`docker exec seta-ap-postgres-dev psql -U seta -d seta -c '<SQL>'`.
