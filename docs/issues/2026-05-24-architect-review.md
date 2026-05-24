# Architect Review — 2026-05-24

Branch reviewed: `refactor/pr-f-shared-cleanup` @ `8f2ab780`. Scope: architecture, data, security, infra, frontend, testing.

**Bottom line:** Well-engineered, opinionated monorepo with unusually disciplined boundary enforcement. Architectural fundamentals are production-grade. Risk surface is concentrated in **runtime operability** (observability, dispatcher behavior under load, DR) and a few **security gaps** that need to close before the first paying tenant.

---

## 1. Architecture & Boundaries — Grade: A

**Strengths**
- `.dependency-cruiser.cjs`: 1,599 modules, 4,641 deps, **0 violations**, **0 ignore directives**. Pattern-based — new modules inherit enforcement for free.
- Module public surfaces (`packages/<m>/src/index.ts`) narrow and stable; internals sealed.
- `copilot` engine truly composes via SDK contracts (`packages/copilot/src/register.ts:21-26`).
- Multi-layered schema isolation: `pgSchema` + `schemaFilter` + `lint:raw-sql` + no cross-schema FKs.
- `shared-*` tier purity confirmed (11 packages, 0 feature-module imports).

**Gaps**
- `lint:module-shape` gates only 5 of 8 feature modules. `core`, `integrations`, `knowledge` deferred — internal structure can drift silently.
- `lint:raw-sql` hard-codes `planner` paths (`scripts/audit-raw-sql.sh:23`); needs templating before `integrations`/`knowledge` go live.
- `staffing` invokes planner tools via `as ExecutableTool<I,O>` cast — necessary for decoupling but loses compile-time contract safety. Branded type in `@seta/copilot-sdk` would close this.

## 2. Data Layer & Scalability — Grade: B (strong design, runtime hardening needed)

**Strengths**
- Outbox correct: tuple cursor `(occurred_at, id)` defeats UUID lexicographic drift; microsecond precision preserved as raw PG text.
- `core.events` partitioned monthly; lazy partition creation. Idempotency table + DLQ with exponential backoff.
- Drizzle migration runner uses **SHA-256 checksums + `pg_advisory_xact_lock`** — forward-only, replica-safe (`packages/shared-db/src/migrate.ts:51-78`).
- Index hygiene on planner hot tables genuinely good.

**Risks — will bite at scale**
- 🔴 **Failure backoff state is in-memory `Map`** (`packages/core/src/events/failure-state.ts:9`). Crash → retry storm; multi-replica → divergent state.
- 🔴 **Single-flight dispatcher tick** (`if (inFlight) return`) + `Promise.all` over all subscribers. One slow subscriber blocks the world and can stampede the pool (`packages/core/src/events/index.ts:113-133`).
- 🟡 `deadLetterCount24h` hard-coded to `0` in health endpoint (`packages/core/src/events/dispatcher.ts:141-154`). Poisoned subscriptions invisible to ops.
- 🟡 No RLS — tenant safety is one missing `where(eq(tenant_id, …))` away. Audit `deleted_at IS NULL` filters across every list query.
- 🟡 No cross-schema FKs is correct by design but orphan rows depend on app-layer cascades. Needs sweeper or weekly detection query.

## 3. Security — Grade: B− (solid bones, named gaps to close)

**Strengths**
- Argon2id at OWASP-grade params (m=19,456, t=2). HIBP on signup.
- HITL `needsApproval: true` enforced via `defineCopilotTool` wrapper; reads omit it correctly.
- `buildActorSession()` derives tenant from grants, never trusts client headers.
- SSO no JIT — `not_pre_provisioned` rejection (`packages/identity/src/backend/auth.ts:184-185`).
- Env validated by Zod (`apps/server/src/env.ts`), fail-fast on missing required vars.
- Comprehensive audit via `core.events` with actor + before/after + tenant partitioning.

**Must fix before first paying tenant**

| Sev | Issue | Where |
|-----|-------|-------|
| 🔴 HIGH | `hasPermission()` is a stub — only org/tenant admin gating | `packages/shared-rbac/src/visibility.ts:13-18` |
| 🔴 HIGH | File upload: extension whitelist only, **no AV / content-type verification** | `packages/knowledge/src/backend/domain/upload-url.ts` |
| 🟠 MED | **No explicit CORS middleware**; relying on cookie `sameSite: lax` for CSRF | `packages/core/src/composition/hono-app.ts:4-8` |
| 🟠 MED | Rate-limit only on `/sign-in/email` — copilot/upload/search unprotected | `packages/identity/src/backend/auth.ts:139` |
| 🟠 MED | Deactivated users keep valid sessions until 14-day cookie expiry — no `revokeSession` subscriber | identity events |

## 4. Infra & Operability — Grade: B (release pipeline strong, runtime visibility weak)

**Strengths**
- Dockerfiles: multi-stage, non-root UID 10001, tini PID 1, healthchecks, `pnpm deploy --prod --ignore-scripts` for clean runtime.
- Release pipeline: **Trivy scan + Cosign keyless signing + SPDX SBOM attestation** + OIDC ECR mirror.
- Graceful shutdown (`apps/server/src/index.ts:165-182`); readiness gates on dispatcher freshness (30s window).
- OpenTofu modules scaffolded for split-service AWS ECS.

**Operational risks**
- 🔴 **CI does not run `pnpm test`** (`.github/workflows/ci.yml:30-37`). 340 tests don't gate merges.
- 🔴 **Observability hollow**: pino → stdout only. No request IDs, no OTEL instrumentation in code (env wired in compose, not used), no error reporter, no dashboards.
- 🟡 `/api/observability/v1/web-vitals` accepts POST then **drops payload** (`apps/server/src/routes/observability.ts:5`).
- 🟡 `docs/hosting/upgrading.md` does not cover split-mode ordering or blue/green; OpenTofu Layer 4 HCL still unvalidated.
- 🟡 DR runbook absent: no RTO/RPO, no restore-test cadence, no PITR window documented.

## 5. Frontend & Design System — Grade: A−

**Strengths**
- Module-aligned `apps/web/src/modules/*` mirrors backend tiering.
- `packages/shared-ui` owns 100% of styling; `lint:styles` enforces. Zero leakage detected.
- TanStack Router with `defaultPreload: 'intent'`; typed route tree.
- Centralized `planner/state/query-keys.ts`.
- TanStack Virtual on planner board (84px row, 5-overscan). HITL approval card present.

**Gaps**
- 🟡 **No standardized form library** (no `react-hook-form`). LoginCard uses raw `useState`; complex schema-driven forms ad-hoc.
- 🟡 **e2e is one smoke test** (`apps/web/e2e/login.smoke.ts`, 32 lines).
- 🟡 HITL countdown timer (`packages/shared-ui/src/composites/chat-hitl-card.tsx:36`) — `setInterval` without robust cleanup on deadline/unmount edge cases.
- 🟡 Tailwind v4 width-scale collision (per memory) is patched but fragile; arbitrary `max-w-[…]` could re-trigger.

## 6. Testing & Quality — Grade: B

**Strengths**
- `lint:test-layout` forbids stray `__tests__` / `test/` folders.
- Real Postgres via testcontainers with **template-DB clones** (`ensureTemplateDb`).
- Mutation tests verify emitted event from `core.events` — outbox really is the boundary.
- Strict TS at root; near-zero `as any` outside event-payload JSONB.

**Gaps**
- 🔴 **Tests don't run in CI** (same finding as ops).
- 🟡 SDK contract tests just verify "types load." Event payloads have no schema pinning.
- 🟡 Coverage lopsided: planner ~70 tests, `shared-rbac` 1, `shared-testing` 1, `shared-db` 5.
- 🟡 No `noUncheckedIndexedAccess` — JSONB-heavy code path.

---

## Top 10 actions, prioritized

| # | Action | Why | Effort |
|---|--------|-----|--------|
| 1 | Add `pnpm test` to `ci.yml` | Tests aren't gating merges today | 1 line |
| 2 | Persist event-dispatcher failure state + per-subscriber drain isolation | Prevents retry storms & head-of-line blocking | ~1 week |
| 3 | Finish RBAC permission registry; gate every mutation | Current stub is org/tenant-admin only | 1–2 weeks |
| 4 | Add AV scan + real content-type detection on knowledge uploads | Pre-tenant blocker | 2–3 days |
| 5 | Wire OpenTelemetry (traces + request IDs) + structured error reporter | Production currently dark | 1 week |
| 6 | Explicit CORS middleware + tighter cookie `sameSite` | Defense-in-depth on CSRF | 1 day |
| 7 | Session revocation subscriber on user-deactivation event | 14-day stale-session window | 1 day |
| 8 | Expand e2e to 3–5 user journeys (plan CRUD, HITL approve/reject, notifications) | Frontend regression coverage ≈ 0 | 1 week |
| 9 | Document split-mode upgrade ordering + blue/green; finish + `tofu validate` Layer 4 HCL | Avoids inter-service RPC failures mid-deploy | 3–5 days |
| 10 | Promote `core` / `integrations` / `knowledge` to `MODULES_CHECKED`; template `lint:raw-sql` per module | Closes the last enforcement gap | 2–3 days |

---

## Verdict

- **Maintainable & extensible:** ✅ Yes — the boundary discipline is the strongest part of the codebase and the reason this can scale to 20+ modules without collapsing.
- **Scalable:** ⚠️ Conditional — design scales, dispatcher implementation needs hardening before high event volume.
- **Secure:** ⚠️ Close, not there — foundations correct, but the HIGH items are not optional.
- **Production-ready:** ⚠️ Operability gap — release pipeline exemplary, but no OTEL / dashboards / DR runbook isn't operable at real scale.

**Overall: a strong B+ codebase that can be A in one focused hardening sprint.**
