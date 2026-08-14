# FUT-840 — the six revision cases for FUT-807's change-flow lane

Six model-behaviour cases. They are **not** in
`packages/planner/tests/fixtures/golden/cases/` yet, and deliberately so.

## Why they are here and not in the corpus

Today's golden lane drives exactly one target,
`buildPlannerQueryEvalTarget` — the read-only A1 query agent. Every case in the
corpus is `PQ-*`. The lane has no A2 target, no way to inject the server-found
`openPreview` a revision turn depends on, and no way to express more than one
turn. Dropping these six in would not produce a weak test; it would produce six
cases the runner executes against an agent that does not own the tools, failing
for a reason that has nothing to do with what they assert.

FUT-807 covers precisely this. Its **AC5** already reads:

> * A case can describe: ask → preview → revise through chat → confirm, and
>   assert that the revised value is what was written.
> * A case can assert that a revision attempting to point the change at a
>   different task was refused and nothing was written.

So these six slot into an existing requirement rather than needing a new one.
FUT-807 is **READY FOR DEV** — the harness does not exist. Its own notes call
this out: *"AC5 belongs to the harness, not the case set, and it cannot be added
later cheaply."* These cases are written now so the harness has its acceptance
target, and land in the corpus as part of FUT-807.

Everything here is model behaviour and therefore belongs in the **opt-in** lane.
Nothing pinnable without an LLM is left to it: the deterministic half of every
claim below is already pinned in
`apps/server/tests/integration/action-revision-invariants.test.ts` and the six
per-tool unit suites. That is the EV-07 / EV-08 precedent from FUT-806 — the
golden lane is never a per-change gate.

## The cases

1. An update preview is open (due 15/08, priority Urgent).
   User: "à cho sang thứ Sáu tuần sau"
   Expect: `planner_updateTask` called ONCE adjusting the open preview (the
   server supplies its identity) with `patch` naming the date only; exactly one
   pending card afterwards; the reply NAMES the task (design D19) and quotes the
   weekday the tool returned.

2. An update preview is open.
   User: "create a task for the release notes"
   Expect: `planner_createTask` called for a NEW draft — a different tool from the
   one the open card names, so the server treats it as a new request; both cards
   pending; the original still confirmable.

3. No preview open, no task page context.
   User: "make it next Friday"
   Expect: no tool call — A2 asks WHICH TASK.

4. An update preview is open.
   User: "và giao cho Tuấn nữa"
   Expect: no tool call, or `planner_assignTask` refused. A2 asks the user to
   confirm or cancel the open preview first (design D4). The update preview is
   still pending and still confirmable.

5. A merge preview is open ("Alpha" → trash, "Beta" kept).
   User: "à ngược lại"
   Expect: `planner_mergeTasks` adjusting the open preview (the server supplies
   its identity), roles swapped — "Beta" now
   goes to the trash. The pair of tasks is unchanged.

6. An assign preview is open proposing [Bình].
   User: "thêm Tuấn nữa"
   Expect: `planner_assignTask` adjusting the open preview (the server supplies
   its identity) and `assigneeUserIds = {Bình, Tuấn}` — the union computed against the PROPOSED
   set, not the task's stored one. This is the case the OPEN PREVIEW block's
   resolved names exist for.

7. An update preview is open (due 15/08, priority Urgent).
   User: "không phải, chỉ đổi ngày thôi — sang ngày mai"
   Expect: `planner_updateTask` with `correction: true` and a date-only patch;
   the revised card shows the new date and NO priority row.
