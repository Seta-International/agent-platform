# Agent guidance

Contract for coding agents (Claude Code, Codex, any `AGENTS.md`-aware tool) in this repo. `AGENTS.md` symlinks to `CLAUDE.md` — edit one, both update. Tier-specific rules (frontend, backend/data, agent engine) live in `.claude/rules/` and load automatically when you open matching files.

## Where to look first

- [`docs/README.md`](docs/README.md) — full documentation map. Start here; don't guess at doc locations.
- [`docs/platform/architecture.md`](docs/platform/architecture.md) — source of truth for the implementation shape. **When it and the code disagree, the doc is the bug — fix it there.**
- **Before authoring tickets, estimates, PRDs, tests, or a new module, open the matching file in [`docs/guides/`](docs/guides/) and follow it — don't improvise.**

## Fixed foundations (do not propose alternatives)

Node 24 LTS, Turborepo + pnpm workspaces, Vite. Postgres + pgvector with Drizzle ORM only — **no other ORM, no raw migration tool.** Event bus is a transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll — **no SQS, no Kafka.** Backend: Hono, Mastra, graphile-worker. Frontend: React 19, TanStack Router, Astryx design system (`@astryxdesign/core` + StyleX, custom `seta` theme; foundation landed via FUT-562, migration in progress — `apps/web` still on the shadcn/Radix layer today), Tailwind 4, AI SDK v6, assistant-ui. Auth: better-auth + argon2id. Cloud: AWS (ECS Fargate, RDS, Secrets Manager, S3).

## Module boundaries (CI-gated; full rule set in `.dependency-cruiser.cjs`)

- **Cross-module imports go only through `packages/<module>/src/index.ts`** or the `/events`, `/rbac`, `/contracts`, `/agent-tools` subpaths — never deep-import another module. `pnpm depcruise` enforces the tier graph (`shared-*` and `agent` may not import feature modules).
- **No cross-schema foreign keys** — store a bare `uuid` and keep it consistent via events + local read-model projections, not FKs.
- **No cross-module data-handle sharing** — a module never hands its Drizzle client out. Cross-boundary work goes through public function calls (RBAC re-checked at the callee) or domain events.
- **The bus is the outbox** — state change + event row commit in one transaction via `core.emit()` inside `withEmit(session, ...)`. No separate publish path.

## Workflow (CI-gated — get these wrong and the PR bounces)

- **Branch + commit are Jira-keyed.** Never commit feature work on `main`. Branch `<type>/FUT-<n>-<slug>`; commit `type(scope): FUT-<n> subject` (subject ≤ 100 chars). Pull `FUT-<n>` from the ticket. Types: `feat fix chore docs refactor test ci build perf style revert`; `(deps)` bumps skip the key.
- **PRs use [`.github/pull_request_template.md`](.github/pull_request_template.md)** — fill every section, don't collapse to one line. AI-time-saved is *derived* per [`estimation.md`](docs/guides/estimation.md), not guessed; no story points → mark provisional.
- **Tests run against real Postgres via `testcontainers` — never add DB mocks. Write the failing test first.**
- **Run affected tests only** — `pnpm test:affected` or `pnpm --filter @seta/<module> test` (likewise `typecheck:affected`). Full `pnpm typecheck && pnpm lint && pnpm test` is the pre-PR gate or for cross-cutting changes only; `pnpm lint` is fast, run it whole. Add `pnpm test:e2e` if UI changed.
- **Install deps via CLI only** — `pnpm add <pkg>` with no version so the registry resolves latest. Never hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **New modules come from `pnpm gen module`** (see [`creating-modules.md`](docs/guides/creating-modules.md)) — don't invent commands; root `package.json` scripts are the contract.
- **`docs/superpowers/` is gitignored — never `git add -f` or push it.** Local working docs only.
- **Onboarding must stay green:** `clone → install → db:up → db:migrate → bash scripts/dev/tenant-bootstrap.sh → dev` yields a working demo in 5 min on a fresh machine.

## Always

**Production-grade only, never quick hacks.** Diagnose the root cause and ship the optimized solution; "small patch now, real fix later" is rejected on review.

## Astryx design system

**Repo-specific override of the block below** (as of FUT-562's foundation change): the StyleX
compiler IS wired here (`@stylexjs/unplugin` in `apps/web/vite.config.ts` and
`packages/shared-ui/.storybook/main.ts`) — `xstyle` is the supported override mechanism, contrary
to the block's claim. Do NOT import `@astryxdesign/core/astryx.css` (or `reset.css`) into any real
app entry point yet — it's wired into Storybook only
(`packages/shared-ui/.storybook/preview.css`), deliberately isolated because the vendor
stylesheet's unscoped `:root` token defaults collide with Seta's own tokens. See
`DESIGN.md`'s `implementation_notice` for why.

<!-- ASTRYX:START -->
Astryx v0.0.1 · 90+ components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   90+ components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
