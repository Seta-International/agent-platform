# @seta/server

The Seta API server — Hono HTTP entry point, event dispatcher, and
graphile-worker host. Composes every domain module (`@seta/identity`,
`@seta/planner`, `@seta/agent`, `@seta/integrations`) through their
public surfaces and registration hooks.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | tsx watch with `.env` from the repo root |
| `pnpm build` | Emit `dist/` for production |
| `pnpm start` | Run the compiled server (used by the Docker image) |
| `pnpm test` | Vitest, real Postgres via testcontainers |
| `pnpm typecheck` | TS project-references check |
