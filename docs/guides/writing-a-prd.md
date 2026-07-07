# How to write a good module PRD

A playbook for agents writing a Product Requirements Document for a Seta module. Following it produces a PRD that is plain enough for Product/PMO/QA, accurate to the code, and standard in structure.

---

## The five principles

1. **Grounded** — every statement maps to real code, not assumptions. Scan the implementation first; verify the draft against it.
2. **Audience-fit** — a *product* PRD is for Product/PMO/QA. It contains **no code identifiers** (no permission slugs, event names, DB fields, error codes). Engineering detail lives in a separate technical spec.
3. **Plain** — behavioral language a non-engineer reads in one pass. "Prevented with a clear message," not "returns `VALIDATION`."
4. **Standard** — use a recognized outline (below), not bespoke sections. A reader should already know where to look.
5. **Self-contained** — the doc stands on its own authority. Don't point at `architecture.md`, source files, or "the other spec" as the source of truth inside it.

---

## Standards basis

Anchor structure to a recognized standard rather than inventing one:

- **Product PRD** — the conventional PRD outline product teams recognize: overview → goals/metrics → personas/roles → scope → requirements → UX/journeys → open questions (the structure table below).
- **Technical spec (companion)** — **ISO/IEC/IEEE 29148** *Requirements engineering* (the SRS standard that superseded **IEEE 830**): §1 Introduction → §2 Overall description → §3 Specific requirements → §4 Verification, plus appendices (data model, events, interfaces, system attributes).
- **Diagrams** — UML conventions for behavior (use-case, sequence, state); for structural/component views, the C4 idea of one abstraction level per view (and ISO/IEC/IEEE 42010 separation of concerns).

Name the standard *to yourself* when choosing structure — but never narrate it inside the document body (no "Structure follows ISO…" line; that's meta, see writing rules).

---

## Process (do these in order)

### Step 0 — Clarify before writing

Ask the requester three things; the answers change the whole document. Use one batched question.

- **Intent:** Documenting what exists today (as-built), defining what should be built (forward), or hybrid?
- **Scope:** Which subsystems are in scope? (List the module's real subsystems and let them choose.)
- **Audience:** Product/PMO/QA only, or must it also serve engineers? → decides plain-vs-technical and one-doc-vs-two.

Do not skip this. Most rework in practice comes from guessing scope or audience.

### Step 1 — Deep-scan the real system (parallel)

Never write a PRD from memory of the code. Dispatch parallel exploration agents, one per subsystem plus cross-cutting concerns. For a typical module:

- **Domain/behavior** — the public operations, their rules, defaults, edge cases (read the public surface + domain functions + tests).
- **Data model** — entities, fields, constraints (schema/migrations).
- **Events/integration** — what it emits/consumes; external integrations.
- **Access control** — roles, permissions, how access is granted (see the roles trap below).
- **Frontend/UX** — screens, flows, what a user can actually do (UI + e2e tests).

Each agent returns raw facts with file:line citations. You synthesize; you do not paste their dumps into the PRD.

### Step 2 — Decide the document split

- **Product PRD** (`docs/modules/<module>-prd.md`) — plain, no code. For Product/PMO/QA.
- **Technical spec** (`docs/modules/<module>-technical-spec.md`) — data model, events, permission matrix, error codes, state machines. For engineers.

Default to **two documents**. Cramming both audiences into one makes it "too much code for PMs and too long." If the requester only cares about the product side now, write the PRD and keep the technical material in the companion file (don't discard it).

### Step 3 — Write the product PRD (structure below)

### Step 4 — Verify against the code (two audits)

Your draft *will* contain gaps and over-claims. Run both:

- **Completeness audit** — "What core user-facing capability exists in the code but is missing from the PRD?" (Excludes anything explicitly out of scope.) Catches missing features like search, filtering, bulk actions, notifications.
- **Fidelity audit** — "Which PRD claims do NOT match the code — over-claimed, wrong, or not implemented?" Rate each claim Accurate / Partly-off / Not-supported, with file cites.

Fix every finding. Re-verify roles specifically (next section).

### Step 5 — Review as the audience (spawn persona reviewers)

The strongest readability check is to read the doc *as each real stakeholder would*. Spawn one subagent per audience persona, each told to role-play that stakeholder, read the whole PRD, and critique it from that lens — then consolidate the consensus and apply fixes. Re-run after major rewrites.

Give each reviewer a distinct lens and ask for the same shape of output (a verdict, a severity-rated issue table, and top recommendations):

- **PM** — Is it readable and standard? Does §1-2 convey *what it is and why* in under two minutes? Is the product story complete, or does it read as an engineering spec?
- **PMO** — Traceability and governance: do use cases → requirements → acceptance criteria → QA scenarios form a closed loop? Are metrics, owners, and scope boundaries present?
- **QA** — Are acceptance criteria concrete, testable, and **honest** (nothing claimed as covered that isn't)? Is every requirement traceable to a scenario?
- **The module's own end-user roles** (the personas/roles from §3) — Does each capability match how that role actually works?

Apply consensus fixes; where reviewers conflict, prefer the stricter correctness bar. This pairs with Step 4: persona review catches *clarity, completeness, and governance*; the code audits catch *accuracy*. Do both.

### Step 6 — (Optional) PDF

See the PDF recipe at the end.

---

## Product PRD structure

Keep section numbers and order. Scale each section to the module; omit a section only if it genuinely doesn't apply.

| # | Section | Contents | Keep it… |
|---|---|---|---|
| — | Title + doc-control table | Product area, Status (`Baseline · YYYY-MM-DD`), Version, Audience | 5 rows, no meta narration |
| 1 | **Overview** | One plain paragraph: what the module is, in the user's words. Then "The problem" (2-4 sentences) and a "Who benefits" table (persona → value). | A first-timer gets it in <2 min |
| 2 | **Goals & success metrics** | 3-5 goals; a metric table (objective → metric → target). Mark targets **TBD** if they're a business call. | Metrics measurable; targets owned |
| 3 | **Roles & access** | The real access model in plain terms (see the roles trap). A capability table (role × what they can do). | Accurate to the RBAC code |
| 4 | **Scope** | In-scope table, out-of-scope list, and a MoSCoW priority table (Must=MVP / Should / Could / Won't). | Boundaries unambiguous |
| 5 | **How it's organized** | The domain model as a simple diagram (the entity hierarchy) + 1-line definitions of each concept. | Visual, plain |
| 6 | **Use cases** | A use-case diagram (actors → use cases). Show **role inheritance** if roles nest. | One diagram, level-consistent |
| 7 | **Features & requirements** | Numbered requirements (`F-<AREA>-<n>`) grouped by feature area, each a plain statement + bulleted **behavioral acceptance criteria**. | The heart of the doc |
| 8 | **Key journeys** | 2-3 sequence diagrams of important flows, plain participants (User, the system, Microsoft 365). | Runtime only |
| 9 | **States** | State diagrams with plain labels (e.g. "Up to date / Needs review", not `idle/conflict`). | Plain labels |
| 10 | **Acceptance scenarios (QA)** | A table: scenario → expected behavior, plain English, no error codes. Mark tests-to-build in italics. | Testable + honest |
| 11 | **Open questions** | Undecided/vestigial things, each with an owner. | Captured, not hidden |
| — | Footer | One line pointing to the companion technical spec for engineers. | — |

---

## Writing rules

**Plain, not code.** Translate every engineering term:

| Don't write (technical spec only) | Write (product PRD) |
|---|---|
| "requires `planner.plan.create`" | "a Contributor or Admin can…" |
| "rejects with `VALIDATION`" | "is prevented with a clear message" |
| "emits `planner.task.created`" | (omit — it's internal) |
| "`percent_complete ∈ {0,50,100}`" | "Not started / In progress / Done" |
| "`sync_status = conflict`" | "Needs review" |

**Behavioral acceptance criteria.** Each criterion is something QA can observe without reading code. Good: "Moving a task to another plan keeps its owners and checklist but drops its labels; the user is warned first." Bad: "calls `performCrossPlanMove`, deletes `taskLabels`."

**No conversation artifacts.** The doc must not narrate how it was made. Ban phrases like "this document covers three areas," "as the system exists today," "as we discussed," "Structure follows ISO…". Just specify the product.

**Self-contained.** Don't write "see `rbac.md` for the source of truth" or "the integrations spec owns this." State the behavior. Cross-references to *other product docs* are fine; deferring *authority* is not.

**No internal contract leakage.** No table/field names, function names, event names, migration numbers, or file paths in the product PRD. If you need them, they belong in the technical spec.

**Requirement IDs.** Stable `F-<AREA>-<n>` (e.g. `F-TASK-4`). They give QA traceability without being "code." Keep cross-references light — don't build `F-X/AC2 → see §14 R-1` reference chains.

---

## Diagram discipline

Mixing diagram concerns is the most common quality defect. Rules:

- **One concern per diagram.** *Structure* (what depends on what) and *runtime* (what calls what, in order) never share a diagram.
- **Right mermaid type for the intent:**
  - structure/context → `graph` (flowchart)
  - runtime/sequence of calls → `sequenceDiagram`
  - data model → `erDiagram`
  - lifecycle/status → `stateDiagram-v2`
- **One abstraction level** in a structural diagram. Don't put a UI app, modules, sub-modules, and an external system flat at the same level — tier them (client / platform / external) with subgraphs.
- **Consistent notation.** Don't use a DB-cylinder for an external service; keep edge meaning uniform.
- **Caption structural diagrams** to say they show no call ordering (runtime lives in the sequence diagrams).
- **Plain labels** in product diagrams (status names, role names) — not code enums.
- **Validate syntax.** A semicolon-then-comma in a sequence message label breaks mermaid's lexer; if you can, parse each block before shipping.

---

## The roles trap (verify this every time)

Access control is where PRDs are most often subtly wrong. In this codebase there are **three independent axes** — do not conflate them:

1. **Group membership label** — e.g. Owner / Member. An ownership marker; it does **not** by itself grant power.
2. **Access role** — e.g. Viewer / Contributor / Admin. What a person can actually *do*, assigned **separately** (often defaulting to the lowest, e.g. Viewer, on join).
3. **Org/Tenant role** — workspace-wide override that spans all groups.

Common mistake: assuming "group Owner ⇒ Admin." Verify in the RBAC source: how does a user *acquire* each role? What's the default on join? What's org-admin-only vs in-group-admin? Is any role in the UI actually dead (e.g. a `guest` option that's just a test fixture)?

Then describe roles as **two dimensions** (membership label vs access role) and build the capability table straight from the role definitions, not from the persona names.

---

## Anti-patterns (don't repeat)

| Anti-pattern | Fix |
|---|---|
| Writing an SRS and calling it a PRD (code-heavy, too long for PMs) | Split: plain product PRD + technical spec |
| Inventing a bespoke 17-section layout | Use the standard outline above |
| Over-claiming features that aren't built (e.g. a notification that doesn't fire) | Fidelity audit against code; remove or flag |
| Missing whole capability layers (search, filters, bulk, notifications) | Completeness audit against the public surface + UI |
| "Group Owner = Admin" | Three-axis role model, verified in RBAC source |
| Promising a UI button with no backend (e.g. permanent purge) | Mark as open question, not a feature |
| Diagram mixing structure + runtime + levels | One concern, one level, right type, caption |
| Meta narration / deferring authority to other docs | Remove; make it self-contained |

---

## PDF generation (with rendered diagrams)

Plain markdown→PDF tools leave mermaid as raw code. Use the repo script, which pre-renders each diagram to SVG locally (the mermaid library is bundled — no network) and embeds it, reusing an installed browser so nothing heavy downloads:

```bash
scripts/dev/export-pdf.sh docs/modules/<module>-prd.md
# → docs/modules/<module>-prd.pdf  (pass a second arg for a custom output path)
```

Requires Node + an installed Chrome/Chromium/Edge (override the browser with `CHROME_PATH`). Under the hood it (1) runs `@mermaid-js/mermaid-cli` to turn each ```` ```mermaid ```` block into an SVG and rewrite the markdown to reference it, then (2) runs `md-to-pdf` to embed the SVGs (retrying, since the first headless launch can cold-start hang). Verify by opening the PDF and confirming diagrams render as images, not code blocks.

---

## Final checklist

Before declaring the PRD done:

- [ ] Scope, intent, audience confirmed up front
- [ ] Drafted from a code scan, not memory
- [ ] No code identifiers in the product PRD (slugs, events, fields, error codes, file paths)
- [ ] Behavioral acceptance criteria on every requirement
- [ ] Roles verified against RBAC source (three-axis model; default-on-join; org vs in-group)
- [ ] Completeness audit passed (no missing core feature)
- [ ] Fidelity audit passed (no over-claim; UI-only-no-backend items flagged, not promised)
- [ ] Reviewed by audience-persona subagents (PM / PMO / QA + the module's end-user roles); consensus fixes applied
- [ ] Diagrams: one concern, one level, right type, plain labels, syntax-valid
- [ ] No meta narration; self-contained
- [ ] Open questions captured with owners
- [ ] Companion technical spec exists for engineers
- [ ] (If requested) PDF regenerated with diagrams rendered
