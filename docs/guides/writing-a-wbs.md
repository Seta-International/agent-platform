# How to create a WBS for a module program

A playbook for agents (and the product team) breaking a large module — `people`, `hiring`, `pm` — into a Work Breakdown Structure. The **deliverable is a single CSV file** (`docs/modules/<module>-wbs.csv`): one flat table that is at once the WBS dictionary, the sequencing record, and a **Jira-import file** — it opens in Excel and imports into Jira with no reshaping. Each leaf is a **runnable, trackable, plannable** work package mapping to one `slice → spec → plan → PR`.

Ground every WBS in the module's existing design: its product spec ([`../modules/`](../modules/) PRDs) plus the cross-module data and integration design ([`../reference/db-design.md`](../reference/db-design.md), [`../reference/ddd-design.md`](../reference/ddd-design.md)). The PRD's feature breakdown is the embryonic form of this artifact; this playbook turns it into an importable spreadsheet.

---

## The five principles

Everything below is just how to apply these. Each is stated once, here.

1. **Complete (the 100% rule)** — children sum to exactly 100% of the parent: no gaps, no overlaps, no out-of-scope excess. Holds at *every* level, and includes the unglamorous scope — foundation/scaffold, integration, governance/approval flows.
2. **Deliverable-oriented** — rows are outcomes (**nouns**), not actions (verbs). The moment a row reads like a verb, you've hit the work-package floor — the verbs belong in the implementation plan.
3. **Slice-shaped** — every leaf is a **vertical slice** (cuts through schema → backend → events → UI as needed), demoable on its own, = one PR. Never decompose by technical layer.
4. **Grounded** — decomposition maps to the module's real capability inventory and architecture (schema, events, RBAC, tiers), not a guess. Scan the spike or code first.
5. **Trackable** — every row carries a stable ID, one owner, dependencies, a size, acceptance criteria, and its Jira columns.

---

## Standards basis

Anchor structure to recognized standards; name them to yourself, never narrate them in the file.

- **PMI — *Practice Standard for WBS* / PMBOK** — the 100% rule; deliverable-orientation (WBS = nouns, schedule = verbs); the **work package** as the lowest managed/estimated element; the **WBS dictionary** as the per-element companion (here: the row's columns). A WBS has no time or sequence — order is recorded in columns, not row order.
- **PRINCE2 — product-based planning** — decompose deliverables first, activities later; include intermediate *documentary* products (specs, design approvals, test plans) as first-class scope; describe each with explicit quality criteria + acceptance + owner.
- **Agile — vertical slicing, INVEST, story-splitting** — leaves are vertical, demoable slices (Cockburn's "elephant carpaccio") satisfying **INVEST** (Independent, Negotiable, Valuable, Estimable, Small, Testable); split oversized leaves with the **SPIDR** patterns (Spike, Path/workflow-step, Interface, Data, Rules; plus CRUD, simple-vs-complex, defer-performance).
- **Sizing — the 8/80 rule** — a work package is **8–80 hours (≈1–10 days)** and fits one reporting period. A convention, not a hard number: the real test is "reliably estimable, one owner, binary done/not-done?"

WBS levels map onto this repo and Jira:

| WBS level | This repo | `Issue Type` | Example |
|---|---|---|---|
| **Program** | the module | (`Initiative`) | `pm` |
| **Capability** (noun) | capability inventory item | `Epic` | `PM-C3 Resource allocation` |
| **Work package** (vertical slice) | one `slice → spec → plan → PR` | `Story` or `Task` | `PMM-3 Resource allocation (M:N)` |
| **Plan step** (verb) | a step *inside* the plan | `Sub-task` | (owned by the plan, optional in the CSV) |

### Issue types — Epic, Story, Task, Bug

Pick `Issue Type` by what the row *is*, not by size. Only Epics and their leaf Stories/Tasks belong in the WBS.

| Type | What it is | In the WBS? |
|---|---|---|
| **Epic** | A capability area — a container grouping leaves that together deliver one capability. | **Yes — level 1**, one per capability (or capability group). |
| **Story** | A vertical slice delivering observable user/business value (INVEST). The default leaf. | **Yes — level 2 leaf.** Test: "would a stakeholder *see the value* when it ships?" → yes. |
| **Task** | A leaf of enabling/technical work with no direct user value — scaffolding, infra, a shared migration, a spike. Same level as a Story. | **Yes — level 2 leaf.** Same test → no, but still real scoped work (e.g. `PMM-1 Foundation`). |
| **Sub-task** | A how-to step inside one leaf's implementation (the *verbs*). | **Only if** the requester asked for sub-task granularity; otherwise it lives in the plan. |
| **Bug** | A defect in already-delivered behavior; emergent. | **Never** — a WBS is forward scope. Bugs go to the backlog. |

---

## The output: the WBS CSV schema

One row per node. Header exactly as named; quote any cell containing a comma.

| Column | Purpose / notes |
|---|---|
| `WBS Code` | Outline number encoding the tree — `1`, `1.1`, `1.2`, `2`, `2.1` … |
| `WBS ID` | Stable key — capabilities reuse inventory IDs (`PM-C3`); work packages use `<MNEMONIC>-<n>` (`PMM-3`) |
| `Level` | `1`=Capability (Epic), `2`=Work package (Story/Task), `3`=Sub-task (optional) |
| `Parent ID` | Parent's `WBS ID`; blank for level-1 rows |
| `Name` | The deliverable, a **noun** — "Resource allocation (M:N)", never "Build allocation" |
| `Issue Type` | `Epic` / `Story` or `Task` / `Sub-task` — never `Bug` (see *Issue types*) |
| `Summary` | `<WBS ID> <Name>` so the imported issue traces back to this file |
| `Epic Name` / `Epic Link` | Jira hierarchy links (see *Jira import*) |
| `Scope` | What's in — the capabilities (`PM-Cn`) realized, one line |
| `Internal Deps` | Work-package `WBS ID`s that must land first (quote if multiple) |
| `External Deps` | Other modules' events/read-models consumed |
| `Size (days)` | 8/80 estimate (or story points — one unit per file) |
| `Owner` | Single accountable person/role |
| `Acceptance` | Behavioral, observable done-conditions — no code identifiers |
| `MVP` / `Critical Path` | `Y`/`N` — in the minimum slice set / on the longest dependency chain |

**Example rows** (`pm`, abbreviated):

```csv
WBS Code,WBS ID,Level,Parent ID,Name,Issue Type,Summary,Epic Name,Epic Link,Scope,Internal Deps,External Deps,Size (days),Owner,Acceptance,MVP,Critical Path
1,PM-E1,1,,Foundation,Epic,PM-E1 Foundation,PM-FND,,"Module scaffold, schema, RBAC, events/audit",,identity,3,EM,"Module scaffolds and migrates; RBAC + events/audit wired before features",Y,Y
1.1,PMM-1,2,PM-E1,Foundation,Task,PMM-1 Foundation,,PM-FND,"scaffold, pm schema, RBAC, events/audit (enabling; no user value)",,identity,3,Backend,"Empty module scaffolds and migrates; RBAC enforced; events emit with audit",Y,Y
2,PM-E3,1,,Resource allocation,Epic,PM-E3 Resource allocation,PM-ALLOC,,"PM-C3: date-ranged M:N worker↔project assignment",,,,EM,"Allocation visible on worker + project; utilization derived",Y,Y
2.1,PMM-3,2,PM-E3,Resource allocation (M:N),Story,PMM-3 Resource allocation (M:N),,PM-ALLOC,"PM-C3 allocate via recurrence rule + overrides; util batch query","PMM-1,PMM-2","hiring events, people read",8,Backend,"Future-dated allocation shows committed-but-not-started until start; overallocation flagged",Y,Y
```

> A CSV is the canonical deliverable. For an Excel workbook, open it and add tabs as needed — the CSV stays the source of truth. An optional thin `docs/modules/<module>-wbs.md` (one paragraph + a `graph TD` tree) helps humans skim; keep it in sync or skip it.

---

## Process (in order)

**Step 0 — Clarify.** One batched question: which module and which capabilities are in/out of scope; greenfield or extending (greenfield → foundation is a deliverable; extending → it's a dependency); track work packages only or also sub-tasks; size unit; and any must-hit demo defining the MVP. Most rework comes from guessing scope or granularity.

**Step 1 — Inventory the deliverables.** Your level-1 decomposition is the module's **capability inventory** — derive it from the PRD's *Features & requirements* and *Scope* sections, cross-checked against [`../reference/db-design.md`](../reference/db-design.md) (entities) and [`../reference/ddd-design.md`](../reference/ddd-design.md) (events/boundaries). For a module already in code, dispatch parallel exploration agents (domain/behavior, data model, events/integration, access control, frontend/UX), each returning facts with `file:line` cites. Synthesize a capability list; don't paste agent dumps into the CSV.

**Step 2 — Decompose to the 100% rule.** Level-1 rows = capability areas (nouns) totalling 100% of the module, *including* foundation, integration, and approval/governance flows. Decompose each into vertical work-package rows (set `Parent ID`). Verify MECE at each level — if a slice spans two capabilities, file it under its primary one and make the other a dependency. Stop at the work-package floor: each leaf is a `Story` (user value) or `Task` (enabling), one coherent PR; can't make it one PR → too big, split it; splitting wouldn't change estimation/ownership/tracking → too small, roll it up.

**Step 3 — Sequence.** Fill `Internal Deps` / `External Deps` per row, set `Critical Path = Y` along the longest chain, and `MVP = Y` on the minimum slice set that lights up the headline capability or integration. Order lives in these columns — sorting the file must never change its meaning.

**Step 4 — Write the CSV.** Emit `docs/modules/<module>-wbs.csv` with the exact header, rows ordered top-down (each parent above its children) so it's readable and Jira-importable in one pass.

**Step 5 — Verify (three audits).**
- **Completeness** — "what scope exists in the inventory/code but has no row?" Catches the usual misses: foundation, integration glue, approval flows, audit/events, notifications.
- **Non-overlap (MECE)** — "do any two rows claim the same scope?" → merge or re-cut.
- **Sizing (8/80)** — "any leaf > ~10 days (split) or < ~1 day (roll up)?"

Then validate mechanically: exact header, constant column count, every non-level-1 row has a resolvable `Parent ID`, no orphan dep IDs, commas quoted.

**Step 6 — Persona review.** Spawn one subagent per stakeholder, role-playing the reader, to critique the whole CSV; apply consensus, preferring the stricter completeness/MECE bar:
- **Delivery lead / EM** — is each slice buildable and demoable alone? Is the critical path real, the sizing plausible?
- **PMO** — is scope 100% covered with single owners? Do capability → work package → acceptance form a closed loop?
- **Executing agent** — could you take any one row straight into a spec/plan with no missing context? Is anything a horizontal layer in disguise?

**Step 7 — Hand off.** The CSV is the Jira import file (below). Each work-package row then becomes one `spec → plan → PR` via `writing-plans` — its `Acceptance` seeds the plan's success criteria.

---

## Naming: nouns, not verbs

The `Name` column is the deliverable, never the act of producing it:

| Don't write (verb) | Write (deliverable noun) |
|---|---|
| "Build the allocation schema" | "Allocation aggregate + schema" |
| "Wire up events and audit" | "Events/audit foundation" |
| "Implement the charter approval flow" | "Project charter flow (submit → review → approve)" |
| "Test the placeholder fill path" | (omit — testing is the row's `Acceptance`, not its own row) |

`Acceptance` is behavioral — observable without reading code ("a future-dated allocation shows committed-but-not-started until its start date"), not "calls `commitAllocation`".

---

## The horizontal-slice trap

The most common WBS defect on a software module is **slicing by technical layer instead of by deliverable**. It looks organized and is quietly wrong.

```
✗ WRONG (horizontal — layers as rows)            ✓ RIGHT (vertical — slices as rows)
  pm                                                pm
  ├── Database (all tables)                         ├── PMM-1 Foundation (scaffold+schema+RBAC+events)
  ├── Backend (all APIs)                            ├── PMM-2 Accounts + Projects (charter flow, e2e)
  ├── Frontend (all screens)                        ├── PMM-3 Resource allocation (M:N, e2e)
  └── Testing                                       └── PMM-4 Staffing demand (placeholders, e2e)
```

Nothing on the left is demoable until every layer integrates, so progress is invisible until the end; "Database" has no single owner and no observable acceptance; and the layers overlap every capability at once, violating MECE. Each right-hand slice demos independently, passes INVEST, and becomes one PR.

---

## Jira import

The WBS is the scope **map**; the Jira backlog is the prioritized **route**. Seed the backlog from the CSV, then let prioritization live in Jira. The schema is already importable; the mechanics that bite:

- **Story ↔ Epic** — capability rows set `Epic Name`; each Story/Task row sets `Epic Link` to its parent's `Epic Name` (newer Jira Cloud unifies this as `Parent`).
- **Sub-task ↔ leaf** — only if you emit sub-tasks: link via in-file `Issue Id` + `Parent Id` numeric columns.
- **Epic ↔ Initiative** — `Parent Link` = the Initiative's issue key (only if the program spans modules, on Jira Premium/Plans).
- **Order** — top-level rows first (the file already is), or two-pass import (Epics, then leaves) so parent keys exist before children reference them.
- **Required columns** — `Issue Type` and `Summary` minimum; map `Size (days)` and `Acceptance` to custom fields.

---

## Final checklist

- [ ] Scope/boundary, intent, granularity, size unit, MVP confirmed up front
- [ ] Built from the capability inventory / code scan, not memory
- [ ] Level-1 covers 100% incl. foundation/integration/governance; leaves are vertical slices (Story/Task), noun-named, INVEST-compliant
- [ ] The three audits pass — completeness (no gap), non-overlap (MECE), sizing (8/80, oversized split with a named pattern)
- [ ] Every leaf: one `Owner`, behavioral `Acceptance`, stable ID, `Summary` = `<WBS ID> <Name>`
- [ ] Order lives in the Deps / `Critical Path` / `MVP` columns, not row order
- [ ] CSV mechanically valid: exact header, constant column count, resolvable `Parent ID` + dep IDs, quoted commas; Jira links consistent (`Epic Name`/`Epic Link`)
- [ ] Reviewed by personas (delivery lead / PMO / executing agent); consensus applied
