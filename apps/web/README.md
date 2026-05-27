# @seta/web

The Seta web client — React 19, TanStack Router, AI SDK v6 paired with
assistant-ui, and `@seta/shared-ui` for every primitive. The only
front end for the platform; ships planner views (board, grid, sheet)
and the agent chat surface.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Type-check, generate routes, and emit a production bundle |
| `pnpm test` | Vitest unit + component tests (happy-dom) |
| `pnpm typecheck` | TS project-references check |
| `pnpm lint` | ESLint with boundaries plugin |

Use `pnpm dev` from this directory or `pnpm dev` from the repo root to
launch the whole stack via Turborepo.
