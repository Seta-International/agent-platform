# Estimation & sizing

How we size a ticket and derive its time-saved figure **by anchoring to reference examples**, not by guessing. A calibrated estimate is what makes sprint planning predictable and what makes the AI-time-saved / ROI numbers defensible instead of a hunch.

Two numbers come out of this guide: **story points** (planning) and, later, **AI time saved** (ROI). Both are anchored, and a human can always correct them.

---

## Story points — the scale

Fibonacci, capped low on purpose. Points measure **effort + complexity + uncertainty**, not calendar time.

| Points | Feels like | Shape |
|---|---|---|
| **1** | trivial, no unknowns | a copy/label change, a config flag, a one-field addition with a test |
| **2** | small, mechanical, isolated | one idempotent read-model projection; a narrow validation rule |
| **3** | one focused surface, few unknowns | a single binding/flow (e.g. first-login links to an existing person); a bulk-import validator |
| **5** | a full vertical slice with real rules | a CRUD entity with field-level edit + change history; a document vault with expiry |
| **8** | a multi-part workflow or a foundation | a multi-lane onboarding board + state machine; a request→approval-chain→apply flow; a module scaffold |
| **13** | **too big — do not start** | split it first with a SPIDR pattern ([`writing-a-wbs.md`](writing-a-wbs.md)); a 13 is a planning smell, not a work item |

Most healthy leaves land at **3 or 5**. If everything is an 8, the slices are too coarse; if everything is a 1, they're too fine and tracking overhead dominates.

---

## How to estimate — by analogy, not by feel

1. **Find the nearest anchor.** Read the ticket's acceptance criteria and ask: *which reference shape above is this most like?* "This is like a full CRUD slice with rules → 5." Anchoring to a known example is the whole method — it is how humans estimate reliably and how an agent avoids inventing a number.
2. **Adjust for the unknowns, not the keystrokes.** More points for genuine uncertainty (an unfamiliar integration, an unclear rule), not for volume of boilerplate — boilerplate is exactly what AI makes cheap.
3. **Sanity-check against 1–10 days of work.** If the honest answer is "more than ~10 days / can't be one PR", it's a 13 → split. If "under an hour", roll it up.
4. **When in doubt, size up and split.** Two 3s you understand beat one 8 you don't.

An agent estimating a ticket should carry these anchors as calibration and state its analogy explicitly in the ticket ("sized 5 by analogy to a CRUD-with-rules slice"), so a human can check the reasoning, not just the number.

---

## From points to hours, and to AI time saved

Planning uses points; ROI needs hours. We bridge them with a **team velocity constant** and reconcile against what actually happened.

```
baseline_hours = story_points × velocity        # velocity = the team's hours-per-point WITHOUT AI
                                                  # a team-owned constant, recalibrated each quarter from real deliveries
baseline_hours = reconcile(baseline_hours, code_change)
                                                  # cross-check against the merged PR's real size (lines / files / complexity);
                                                  # a "3-point" ticket that shipped a 2,000-line diff is flagged, not trusted
ai_time_saved  = baseline_hours − actual_hours_with_AI
```

- **`velocity` is measured, not assumed.** Set it from the team's own historical hours-per-point on non-AI work, and re-derive it quarterly. Do not ship a made-up constant as if it were fact; until it's calibrated, mark it provisional.
- **The code-change reconciliation is a second, independent anchor.** Story points are estimated up front and can be mis-sized; the actual diff is ground truth about scope. When the two disagree sharply, the ticket is surfaced for review rather than silently believed.
- **The human holds the final say.** The derived `ai_time_saved` is written to the ticket's **AI Time Saved** field as a *proposal*. An engineer can overwrite it in Jira, and the human value wins. This keeps ROI honest without turning it into paperwork.

This is deliberately the opposite of a free-form "how many hours did AI save you?" box — that invites a guess. Here the number starts from a calibrated estimate, is checked against real code, and is only then optionally corrected by a person.

---

## What this feeds

- **Story points** → sprint capacity, throughput, and the delivery-predictability signal.
- **AI Time Saved** → the ROI headline (hours saved × blended rate − tool cost). Because it is derived and human-correctable, the trend is trustworthy — read the trend, not any single ticket.

---

## Anti-patterns

| Don't | Do |
|---|---|
| Invent a point value to look busy | Name the reference shape you sized against |
| Points as "days I'll spend typing" | Points as effort + complexity + uncertainty |
| Start a 13 | Split it first; a 13 is unestimable by definition |
| Free-form "AI saved me ~5 hours" | Derive from points × velocity, reconcile against the diff |
| Treat velocity as a fixed magic number | Recalibrate it each quarter from real deliveries |
| Trust a single ticket's saved-hours | Trust the trend across many tickets |
