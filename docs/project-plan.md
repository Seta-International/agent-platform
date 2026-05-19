# Seta — Project Plan (Phase A focus)

A working PM document. Source of truth for *what we ship and in what order*. Implementation shape lives in `docs/architecture.md`; product scope in `docs/requirements.md`; role/screen detail in `docs/rbac-and-screens.md`. This doc cites those — it does not restate them.

## 1. Vision

Seta is a multi-tenant, AI-first work-management platform whose Phase A flagship is a **standalone Copilot module** where the agent *is* the UI: a user converses with the Supervisor or `planner.agent` and reads, searches, and writes planner data end-to-end (HITL-gated). The bet is that an agent-first surface, backed by a modular monolith with strict boundaries, is more defensible than catching up on Kanban-board feature parity. Phase B brings the Kanban UI + MS Planner sync + the embedded copilot panel; Phase C closes the compliance and accessibility loop.

## 2. Phase A milestones

Five milestones, derived from §14.1 (Phase A scope), §O (vertical-slice build order), post D7 (4 workflows), D8 (defer staffing.agent + Timesheet MCP + superadmin UI), D11 (ops readiness suite). Each milestone is shippable to the demo tenant.

### M1 — Foundation

**Scope**

- Repo layout per §19.1; Turborepo workspaces for `core`, `identity`, `planner`, `copilot`, `integrations`, plus the 7 shared packages (D13/D14).
- `core` HTTP shell on Hono; outbox dispatcher (§F) with `LISTEN/NOTIFY` + 2s fallback poll; `core.events` schema migrated.
- Module boundary tooling green: dep-cruiser config per §A5, ESLint boundary rule (§B.1), Drizzle schema scoping (§B.2), raw-SQL CI audit (§B.3), public-API integration test harness (§B.4).
- `shared/db` (three pools per D10/§K.2), `shared/rbac` (VisibilityGate + permission-string types), `shared/testing` (testcontainers + fakes) — load-bearing for every later milestone.
- `apps/cli` skeleton; `tenant-create` lifts a tenant row + cascades seeds (full §2.6 cascade lands in M5).

**Exit criteria**

- Boundary-tooling CI gate green on an empty change (per §14.1 architecture/correctness gate row 1).
- Outbox dispatcher delivers events to a no-op subscriber under a synthetic burst — does not need to hit the 10k events/min target yet; that's an M5 gate.
- `pnpm test` runs the public-API integration harness with `shared/testing` fakes.

**Dependencies**

- None (entry point).

**Headline risk**

- Boundary tooling overhead bites every PR if rules are too strict at M1. Mitigation: ship the dep-cruiser config in "warn" mode for one week before flipping to "error."

### M2 — Backend trifecta + copilot read path

This milestone runs as **three concurrent streams** converging on a single demo: "list my tasks" works in chat.

**Scope (stream A — identity)**

- better-auth wiring (local password, argon2id) per §G.1.
- `identity.user`, `user_profile` (skills, availability, working_hours, tz), `role_grants`, sessions.
- `sessionMiddleware` + scope cache per §G.2–§G.3.
- Login UI, password reset, email verification, profile/settings page.

**Scope (stream B — planner backend)**

- Full §E.3 schema: groups, plans, buckets, tasks (incl. optional `skill_tags` + `review_state` refinements per D15 — default empty/null is the normal case), assignments, checklist items, labels, `task_chunks` / `task_embeddings` / `plan_embeddings` tables.
- Public API for read + write (`packages/planner/src/`).
- Hono routes under `/api/planner/v1`.
- Mastra tool definitions per §H.2 — read-only first (`listTasks`, `getTask`, `searchTasksSemantic` with stub embeddings); write tools deferred to M3.
- Seed script (`pnpm seed`) — demo tenant with groups/plans/tasks; most untagged so the agent's semantic + LLM filter path is exercised, a subset with `skill_tags` / `review_state` to show the optional-refinement path (per D15).

**Scope (stream C — copilot runtime baseline)**

- Mastra installed; `@mastra/pg` `PostgresStore({ schemaName: 'copilot' })` per §A3; `chatRoute()` mounted via `@mastra/hono` adapter per §A7.
- Supervisor agent + `planner.agent` specialist (read-only tools only).
- Per-session Agent instance, LRU-cached, hash on **role set only** (D9, §A8).
- Standalone Copilot module UI: sidebar with thread history, agent selector (Supervisor + `planner.agent`; gated to `copilot.contributor+`), chat main pane with streaming.
- `shared/observability` lands here — OTel SDK, pino, attribute conventions.

**Exit criteria**

- Demo journey step 4–5 from §14.1 works: user picks Supervisor, says *"find tasks needing review on terraform"*, gets ranked cards streamed back. Embeddings still stubbed at this milestone — semantic results are placeholder.
- Agent selector RBAC gate enforced (`copilot.contributor+` for `planner.agent`).
- Identity-only test from §A2 round-trips a `user_profile` row alongside a better-auth user.
- All three streams' boundary checks pass in CI.

**Dependencies**

- M1.

**Headline risk**

- Public-API contract drift between streams B and C. Stream C builds tools against the *types* exported from `@seta/planner` (the public surface in `src/index.ts`); if those types churn, every tool wrapper churns with them. Mitigation: planner public-API types frozen at end of M2 week 1; subsequent planner work goes into implementation, not signature changes.

### M3 — Embeddings + write path

Two parallel tracks under one milestone.

**Scope (track 1 — embeddings CDC)**

- §I pipeline: CDC subscribers on `planner.task.*` and `planner.plan.*` events; graphile-worker job queue; embed worker calling the provider; HNSW index per §A10 with `tenant_id` prefilter.
- Backfill on demo tenant; `searchTasksSemantic` returns real results.
- 2-lever embeddings backpressure per D4 / §A11 (queue-depth threshold + per-tenant fair-share); the three reactive levers stay deferred.
- `shared/crypto` lands here — Secrets Manager reader needed for provider keys.

**Scope (track 2 — HITL write tools)**

- `createTask`, `assignTask`, `updateTask`, `addSkillTag`, `toggleReviewState`.
- AI SDK v6 `needsApproval` per §A6; assistant-ui Interactable confirmation cards per §H.2.
- Audit attribution per §L.3 / D6 (inline writes to `core.events`).
- `shared/mailer` (D13) lands here if any write tool fires an email (e.g., assignment notification); otherwise defers to M4.

**Exit criteria**

- Demo journey step 6 from §14.1 works end-to-end: assign-task tool → HITL card → user confirms → assignment + event row + audit attribution committed in one transaction.
- Embeddings freshness ≤ 60s under normal write load (§14.1 acceptance gate).
- HITL verified on **every** write tool — handler runs only after user confirms (§14.1 gate).

**Dependencies**

- M2 (planner schema + copilot runtime + tool registry).

**Headline risk**

- graphile-worker burst behavior under load. The §14.1 load-test target (1k jobs / 10s drain, p95 ≤ 30s) is not yet exercised at M3 — but if the cadence is fundamentally slow, M3 demos feel sluggish and M5 surfaces it as a blocker. Mitigation: spike a representative burst at M3 close; if it fails, the pg-boss fallback (§P risk 1) is a ~1-sprint port and worth doing before M5 rather than after.

### M4 — Workflows + admin shell

**Scope**

- Three Phase-A workflows (D7 + D15, §H.9):
  - `session-cache-invalidate` — event-triggered on role/membership change.
  - `embeddings-keep-fresh` — already wired in M3; documented + monitored here.
  - `new-task-skill-tag-suggester` — event-triggered, HITL card posts to creator's chat. Thin glue layer calling the `infer_task_topics` primitive (shared with the agent's untagged-task reasoning path).
- Standalone Copilot Workflows tab (per §J.2): recent-runs list, per-run drill-down screen.
- Tenant admin → users list + invite + role-grant (bare-bones; no audit-log browser, no IdP mapping UI per D8).
- `apps/cli tenant-create | suspend | delete` finalized — superadmin tenants UI deferred to Phase B (D8).

**Exit criteria**

- All three workflows run on the demo tenant; suspend/resume outbox test from §14.1 / D12 passes against `new-task-skill-tag-suggester`.
- Tenant admin can invite a user, assign `planner.contributor` in a group, and that user immediately sees the right tools in chat (validates the session-cache-invalidate flow).
- CLI lifecycle commands produce the audit trail expected by M5's cascade test.

**Dependencies**

- M2 (event bus + sessions), M3 (embeddings — `new-task-skill-tag-suggester` needs them).

**Headline risk**

- Workflows tab UI scope creep — the drill-down screen is the only place workflow internals leak to the user, and product-pressure to make it "richer" is constant. Mitigation: PM owns the per-run-screen wireframe; anything beyond run status + step list + error payload goes to Phase B.

### M5 — Ops readiness + acceptance bake

**Scope**

- Observability rollup: traces (§L.1), metrics (§L.2), per-tenant cost-envelope dashboard against the §10.2 target (D11d).
- Tenant deletion cascade end-to-end (D11a, §2.6): zero rows in any module schema, no Mastra durable state, no embeddings, pseudonymized actor in `core.events`.
- Three load tests (D11b, §14.1): agent turn p95 ≤ 5s cold cache; HNSW p95 ≤ 200ms at 1.5M vectors; graphile-worker 1k-in-10s drain p95 ≤ 30s.
- Three correctness tests (D12, §14.1): trace+actor presence; suspend/resume outbox; Mastra schema-leak boot assertion.
- Outbox under 10k events/min sustained (§14.1 gate).
- Secrets-rotation runbook authored (D11c, doc-only Phase A; implementation Phase B per §K.5).
- RPO/RTO target documented in operator guide (§10.4).
- Phase A acceptance bake: run every §14.1 gate against the demo tenant; fix gaps until clean.

**Exit criteria**

- All §14.1 acceptance gates green (the whole list, not a sample).
- Demo journey from §14.1 reproducible from a fresh tenant in under 10 minutes by someone who didn't build the system.

**Dependencies**

- M4 (all four workflows must exist for D12 suspend/resume + trace presence tests).

**Headline risk**

- Acceptance bake uncovers a structural gap (most likely candidate: tenant deletion cascade leaves Mastra durable state). Mitigation: tenant-deletion cascade integration test gets written and run starting at M4, not as a final M5 task. Cascade is the highest-blast-radius §14.1 gate.

## 3. Phase B and Phase C

**Phase B — Planner UI + sync + collaboration.** Triggered when Phase A demo is signed off and the first dogfood pass (Seta International internal use) surfaces priorities. Scope per §14.2: Planner Kanban UI + task detail editor + embedded copilot panel; MS Planner sync end-to-end (delta poll, ETag PATCH, conflict log, `capability-gap-translation` HITL workflow); Entra OIDC + JIT + IdP-group→role mapping UI; comments + @mentions + in-app notifications + `comment_embeddings`; attachments (S3 + ClamAV + per-tenant quota — `shared/storage` lights up here); SSE on Kanban; bulk operations as new copilot tools; `staffing.agent` + the cross-module staffing primitives (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`) + Timesheet MCP client (the D8 deferral lands here, reshaped per D15 — no macro `recommend_reviewers` tool; the §7.2.2 composition recipe lights up once primitives ship); audit-log browser UI; HIBP check for local-password registration. Deliberately deferred to Phase C: anything compliance-shaped (DSR, MFA, WCAG audit, secrets-rotation implementation).

**Phase C — Polish + compliance.** Triggered when a first enterprise prospect requires SOC 2 / GDPR DSR / WCAG, or after the second dogfood pass. Scope per §14.3: DSR tooling (export + erasure across primary data, audit pseudonymize-in-place, S3, chat history, embeddings); audit-log export (JSON/CSV); MFA (`better-auth/plugins/two-factor`); concept-map editor for skills; per-tenant rate-limit + cost dashboards; account-collision admin tool; tenant attachment-quota UI; reference Terraform/CDK for ECS Fargate; WCAG 2.1 AA audit (a hard Phase C gate); per-tenant knowledge RAG. Deliberately deferred indefinitely: anything in §11 not promoted into B or C.

## 4. Critical path and parallelization

**Gating chain.** M1 → M2 → M3 → M4 → M5. Each milestone closes its predecessor's exit criteria; no leapfrogging. M5 is the only convergent milestone — everything else has internal parallel streams.

**Parallelization opportunities for a 4–5-engineer team:**

1. **M2's three streams (identity / planner / copilot) run concurrently.** Per the directive to build copilot in parallel with planner: copilot tool wrappers stub against types exported from `@seta/planner` until planner fills implementations. Identity has no shared seam with the other two beyond `role_grants` and event subscriptions, so it runs cleanly alongside. Suggested split: 2 engineers on planner (schema breadth), 1 on identity, 1–2 on copilot runtime + standalone UI.
2. **M3's two tracks (embeddings CDC vs. HITL write tools) run concurrently.** They touch different files (embed workers + `searchTasksSemantic` vs. assistant-ui Interactables + write tool wrappers) and different §H.2 layers. Suggested split: 2 engineers on the CDC pipeline + provider integration, 2 on write tools + audit attribution.

**Single-thread points.** M1 (everyone needs the foundation), M5 acceptance bake (one operator running the gate suite while others fix). M4's Workflows tab UI is hard to parallelize across more than one frontend engineer.

## 5. Cross-cutting tracks

These layer continuously onto the milestones — they don't "ship" at a specific gate. The plan tracks them by which milestone they first land in and which milestone they're audited against.

**Observability (`shared/observability`).** Lands in M2 with the first OTel-instrumented request path. Dashboards iterate every milestone. Audited at M5 (D11d cost-envelope dashboard against §10.2 target).

**Ops readiness suite (D11a–d).** D11a (tenant deletion cascade): integration test written starting M4, gate at M5. D11b (three load tests): rigs built at M4 close, gates at M5. D11c (secrets rotation): runbook drafted in M4, doc-only Phase A — implementation Phase B per §K.5. D11d (cost envelope target): dashboard at M5, baseline against §10.2 target.

**Seven shared packages (D13/D14).** Three are load-bearing and land at M1: `shared/db` (three pools per D10/§K.2), `shared/rbac` (VisibilityGate predicate + permission-string types), `shared/testing` (testcontainers + fakes). Three land with their first consumer: `shared/observability` (M2), `shared/crypto` (M3, with the embedding-provider secret read), `shared/mailer` (M3 or M4 depending on first email trigger). One stays a Phase A seam only: `shared/storage` (S3 wrapper) — declared but unused until Phase B attachments.

**Boundary discipline.** dep-cruiser + raw-SQL grep + Drizzle schema scoping + public-API integration tests all green from M1 onward. Every milestone re-runs them in CI; a fail is a P0.

**AI-first design lens (§7.0a).** Not a track with deliverables — a review criterion. Every write surface goes through HITL; every workflow surfaces value in chat, not a sidebar widget. PM owns this in design review for each milestone.

## 6. Risks and unknowns

| # | Risk | Blast radius | Escalation trigger | Mitigation owner |
|---|---|---|---|---|
| 1 | Planner public-API type drift between M2 streams B and C | M2 slips a sprint, copilot tools rewritten | Stream B & C diverge on a shared type for >5 days | Tech lead (freeze types end of M2 wk 1) |
| 2 | graphile-worker cadence under burst load | Embeddings lag exceeds 60s; M5 load-test fail | M3 spike fails 1k-in-10s drain | Tech lead (pg-boss port, ~1 sprint, do before M5 not after) |
| 3 | Mastra / assistant-ui pre-1.0 churn | Weekly upgrade pain; full-stack regression in CI | Minor version with breaking API | Tech lead (pin minor per §17.3; weekly review) |
| 4 | HNSW vector search latency at 1.5M vectors | Chat composition p95 exceeds 5s, demo feels slow | M5 load test #2 fails | Tech lead (partition trigger per §A10; revise embed dim or HNSW params) |
| 5 | AI cost envelope exceeds $50/tenant/month target | Gross-margin concern at scale; recap with finance | M5 dashboard reads 2× target on demo workload | PM (tune cost cap per §7.4; model selection) |
| 6 | Tenant deletion cascade incompleteness | GDPR exposure on first dogfood | Cascade integration test surfaces orphaned rows in any module schema | Tech lead (Slice 11 / M5 gate) |
| 7 | Demo bootstrap (seed + agent-driven) breaks on schema change | Flagship demo fails to reset between sales calls | Seed script regression in CI | PM + tech lead (smoke test in CI every milestone) |
| 8 | OpenAI embedding-provider availability | Embeddings stop refreshing, semantic search staleness grows | Provider error rate sustained >5% for >1h | Ops (graceful degradation per §P; queue persists, reactive pause) |

## 7. Decision log seed (D1–D20)

This is the ADR ledger as of 2026-05-19 architect review. Edits land here as new D-rows; nothing in this table moves backward without a written reversal.

| ID | What | Doc anchor |
|---|---|---|
| D1 | Revert §C to imperative `ContributionRegistry`; reject the declarative-manifest draft | architecture.md §C; requirements.md §1.6.3 |
| D2 | Trim future-extraction narrative (single playbook reference only) | architecture.md §M; requirements.md §1.6.12 |
| D3 | Collapse §M.2 (frontend extraction subsection) | architecture.md §M.2 |
| D4 | Embeddings CDC backpressure — 2 levers for Phase A, 3 reactive levers deferred | architecture.md §A11 |
| D5 | Strip future-business-module worked examples (§F.4 timesheet/pmo subsections) | architecture.md §F.4 |
| D6 | Collapse `core.audit` into `core.events`; audit read via `core.audit_v` view | requirements.md §1.6.5a + §8.1; architecture.md §L.3 |
| D7 | Phase A workflows = 4 (drop `workload-cache-refresh`, `audit-flush`, `leave-overlap-warning`) | requirements.md §14.1; architecture.md §H.9 |
| D8 | Defer `staffing.agent` + `recommend_reviewers` + Timesheet MCP + superadmin tenants UI to Phase B | requirements.md §14.1; architecture.md §O slice 7 |
| D9 | Per-session Agent cache hash on **role set only** (not full session) | architecture.md §A8 |
| D10 | Three Postgres pools — `webPool`, `workerPool`, `mastraStatePool` | architecture.md §K.2; requirements.md §15.6 (shared/db) |
| D11a | Tenant deletion cascade — implementation gate, not doc gate | requirements.md §2.6 + §14.1; architecture.md §O slice 11 |
| D11b | Three load tests — agent turn p95 / HNSW p95 / graphile-worker burst | requirements.md §14.1; architecture.md §O slice 12 |
| D11c | Secrets rotation — doc-only Phase A, implementation Phase B | architecture.md §K.5 |
| D11d | Per-tenant AI cost envelope target + dashboard | requirements.md §10.2; architecture.md §L.4 |
| D12 | Three correctness tests — trace+actor presence / suspend-resume outbox / Mastra schema-leak boot | requirements.md §14.1; architecture.md §H |
| D13 | Promote 4 cross-cutting concerns to `packages/shared/*` — `mailer`, `observability`, `crypto`, `storage` | requirements.md §15.6 |
| D14 | Promote 3 more — `db`, `rbac`, `testing` | requirements.md §15.6 |
| D15 | Tool catalog is atomic-primitives-only; `recommend_reviewers` and `find_tasks_needing_review` removed as macro tools and reframed as composition recipes (§7.2.2). `skill_tags` and `review_state` reclassified as optional refinements (agent does not depend on them being set). Skill matching uses embedding similarity + assignment-history inference; `skill_concepts` concept map and 4-rule literal/parent/sibling/leaf-of-concept match rule removed. Workload-score weight ladder moved out of spec into tenant config. `stale-review-detector` workflow dropped (mostly idle once `review_state` is optional). New atomic primitives surfaced in §7.2.1: `infer_task_topics`, `infer_user_skills_from_history`, `match_users_to_topic`, `get_user_availability` (with `compute_workload` and `get_leave_overlap` clarified as raw-output primitives without baked-in thresholds). Aligned with Mastra's agent-vs-workflow guidance — small composable tools for adaptive reasoning, workflows only for code-driven deterministic pipelines. Reverses the §5.3 "first-class `review_state` enum" framing, the §3.9.1 concept-map design, the §7.2 macro-tool framing, and the §16.5 monolithic-tool carve-out. | requirements.md §1 header, §3.9.1, §3.9.3, §5.1, §5.3, §7.2, §11.8, §12.2, §12.3, §14.1, §15.3, §16.5; architecture.md §E.3, §F.4.7, §H.4, §H.7, §H.9, §H.10, §O slice 7+8 |
| D16 | Dispatcher hardening: per-`(subscription, event_id)` exponential backoff (1s→60s, 5 attempts) → DLQ + cursor advance; multi-replica safety via `FOR UPDATE SKIP LOCKED` on cursor row | docs/superpowers/specs/2026-05-19-m1-part2-cross-cutting-design.md §3.3 |
| D17 | Test DB lifecycle: one pgvector container per Vitest worker; per-test `CREATE DATABASE … TEMPLATE seta_template` clone (~30 ms); migrations applied once at globalSetup | spec §6 |
| D18 | Hybrid migrations: drizzle-kit for typed tables; sibling hand-written `.sql` for PG features Drizzle cannot model; same folder, lexical filename order; CLAUDE.md updated | spec §7.1, CLAUDE.md |
| D19 | graphile-worker pulled forward to M1 for partition-manager (daily) + DLQ alerter (5-min); consumer of `workerPool` per §K.2 | spec §3.4 |
| D20 | `core.emit()` is strict — throws `EmitContextRequired` outside an `emitContext`; legal entry points: `withEmit`, `withCoreEmitContext`, subscriber framework | spec §3.2 |
| D21 | `packages/shared/ui` is the style monopoly; tokens live only in its `@theme` block; shadcn primitives are overridden to reference DESIGN.md utilities directly (no alias bridge); CI grep audit (`pnpm lint:styles`) blocks any `.css`, `tailwind.config.*`, or `@theme/@layer/@apply` outside that package | docs/superpowers/specs/2026-05-19-frontend-foundation-design.md §3 + §7.3 |
| D22 | DataTable Layer-1 composite ships with client and server modes — sort / filter / global search / expand / select / pagination / column visibility / loading / empty; built on `@tanstack/react-table` + shadcn Table primitive; resizing, drag-reorder, sticky columns, inline edit, virtualization deferred | docs/superpowers/specs/2026-05-19-frontend-foundation-design.md §5 |
| D23 | Chromatic accent re-anchored from Linear lavender (`#5e6ad2`) to Seta blue (`#0047FF` / hover `#1A3CFF` / focus `#022DAD`); palette sourced from `seta-international.com` site CSS to match the brand mark; `DESIGN.md §Colors.Brand & Accent` follow-up PR updates the spec text to match | docs/superpowers/specs/2026-05-19-frontend-foundation-design.md §3.1 + §8.4 |

## 8. What this plan deliberately omits

- **Story points, t-shirt sizes, velocity targets.** Estimation is the team's, not the plan's.
- **Gantt chart, calendar dates, sprint boundaries.** Phase A is the §14.1 budget (~7–10 months for 4–5 engineers); the team chooses cadence.
- **Per-engineer assignments.** The parallelization opportunities in §4 are *team-shaping suggestions*, not staffing decisions.
- **Tooling micro-choices** (CI provider, error tracker, package manager flags). These ride on `docs/architecture.md` §K + §17 and don't belong in the PM document.
- **Marketing / GTM milestones.** Out of scope for this plan; track separately.
- **Phase B/C deliverable detail.** Intentionally one paragraph each — they will be re-planned at Phase A close, against actual dogfood learnings.

---

End. Companion docs: `docs/requirements.md` (product scope, source of truth), `docs/architecture.md` (implementation shape), `docs/rbac-and-screens.md` (role × permission × screen matrix).
