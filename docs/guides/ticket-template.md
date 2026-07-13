# Jira ticket template

The canonical shape of a Jira issue in `FUT`. Most issues are authored a few at a time as a **new feature or epic** is broken down ([`requirement-to-tickets.md`](requirement-to-tickets.md)); a whole-module [WBS](writing-a-wbs.md) is the heavier path that seeds many at once. Either way this guide defines the shape of **one** issue — so every ticket that reaches a developer is a **standard ticket: one clear outcome, right-sized, testable, and not padded.**

Pair it with [`estimation.md`](estimation.md) for the `Story Points` value.

---

## What "standard" means (the bar every ticket clears)

- **One outcome.** A single vertical slice a stakeholder can see when it ships — never a technical layer ("all the APIs"), never two features stapled together.
- **Right-sized.** 1–8 story points ([`estimation.md`](estimation.md)); a 13 is a signal to split, not to start.
- **Testable.** Acceptance criteria a QA can observe **without reading code**.
- **Not padded.** Enough context to act, nothing more. If a section adds no information, delete it — brevity is a feature of a good ticket, not a missing part.
- **Traceable.** Carries its `FUT-<n>` key, its Epic link, and its requirement IDs (`F-<AREA>-<n>`) so every later signal (branch, commit, PR, metric) keys back to it.

---

## One ticket, three readers

A ticket has to serve three readers at once — the **agent** that builds it, the **dev** who reviews it, and the **QA** who validates it. The trick is that they don't need three documents: the **acceptance criteria are the shared contract.** The same Given/When/Then lines are the spec the agent builds to, the definition-of-done the reviewer checks, and the test basis QA runs. Write them once, precisely, and all three are served.

**Sufficiency test** — a ticket is ready only when all three answers are "yes":

- **Agent** — can I implement this without asking a clarifying question?
- **Dev / reviewer** — can I tell, from the criteria alone, whether it's correctly done?
- **QA** — can I write a test for each criterion?

If any answer is "no", the gap is in the ticket, not the reader — fix the ticket. And the reason a good ticket is *short* is that the weight sits on precise acceptance criteria, not on paragraphs of prose: cover every requirement, add nothing that doesn't help one of the three readers act.

---

## Fields

| Field | Rule |
|---|---|
| **Summary** | `<verb-free outcome>` — the deliverable as a noun phrase (matches the WBS `Name`). e.g. "Employee record & field-level edit", not "Build the employee record". |
| **Issue Type** | `Epic` (capability container) · `Story` (user-visible slice) · `Task` (enabling/technical, no direct user value) · `Bug` (defect in shipped behavior). Pick by what it *is*, not by size. |
| **Parent / Epic Link** | Every Story/Task links to its Epic. Every Epic optionally links to an Initiative. |
| **Story Points** | Fibonacci `1 · 2 · 3 · 5 · 8` from [`estimation.md`](estimation.md). Never invent the number — anchor it to a reference example. |
| **Assignee / Owner** | Exactly one accountable person. |
| **Priority** | Set by the PO at backlog refinement, not by the author. |
| **Labels** | Component/area labels as needed. |
| **AI Usage · AI Tool** | Filled automatically from the merged PR — feed adoption reporting. |
| **AI Time Saved** | **Proposed automatically** (derived: `story points × velocity`, reconciled against the real diff — see [`estimation.md`](estimation.md)). An engineer can **note or correct the hours right on the ticket** and the human value wins. Feeds the ROI headline. |

---

## Description structure

Keep the headings; drop any that genuinely don't apply (a `Task` rarely needs "User story"; a `Bug` replaces "Acceptance criteria" with "Steps to reproduce" + "Expected"). Aim for **half a screen**, not a spec.

```
## Why
<1–2 sentences: the value / the problem this closes. The "so that".>

## User story        (Story only)
As a <role>, I want <capability>, so that <outcome>.

## Scope
In:  <the slice — what ships here>
Out: <the nearest thing a reader would assume is included but isn't → point to its ticket>

## Acceptance criteria
- Given <state>, when <action>, then <observable result>.
- Given <edge state>, when <action>, then <observable result>.
  (Behavioral and testable. No function/field/event names.)

## Dependencies
Blocked by: <FUT-n / WBS ID that must land first>
Related:    <links, design doc, Confluence page>

## Notes for the implementer   (optional)
<constraints, the one gotcha, the design decision already made — not a plan>

## AI time saved   (optional, filled after merge)
<hours — leave blank to accept the auto-derived value; override here if it was off. See estimation.md>
```

**Definition of Ready** (before it enters a sprint): outcome clear · sized · acceptance criteria testable · dependencies known · owner set.
**Definition of Done** (before it closes): acceptance criteria met · tests added and green · reviewed and merged · docs updated or N/A.

---

## Per-type quick templates

**Epic** — a capability container, not work itself.
```
Summary: <Capability area, noun>   e.g. "Resource allocation & utilization"
## Why:   <the capability this groups and the value it delivers>
## Scope: <the F-<AREA>-<n> requirements / child slices it contains>
Acceptance: <the capability-level done-condition — "who is allocated where is visible, read-only, scoped">
```

**Story** — the default leaf. Full structure above. Acceptance is user-observable.

**Task** — enabling work; the *why* is another slice, not an end user.
```
Summary: <Enabling outcome>   e.g. "Worker directory read-model"
## Why:   <which slice/capability this unblocks>
## Acceptance: <technical-but-observable — "re-delivering an event twice yields one row; no cross-org leakage">
```

**Bug** — a defect in shipped behavior.
```
Summary: <the wrong behavior, briefly>
## Steps to reproduce: 1… 2… 3…
## Expected:  <what should happen>
## Actual:    <what happens>
## Scope/Severity: <blast radius, how urgent>
```

---

## Anti-patterns

| Don't | Do |
|---|---|
| A ticket that spans "all the endpoints" or "the whole UI" | One vertical slice, demoable alone |
| Acceptance criteria naming functions/tables/events | Behavioral, observable-without-code criteria |
| A 13-point epic disguised as a story | Split with a [SPIDR](writing-a-wbs.md) pattern first |
| Three paragraphs of restated context | The "Why" in one or two sentences |
| Story points guessed to look busy | Anchored to a reference example ([`estimation.md`](estimation.md)) |
| Priority/estimate invented by the author and never revisited | PO sets priority; estimate reconciled against real code change on merge |
