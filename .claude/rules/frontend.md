---
paths:
  - "apps/web/**"
  - "packages/web-*/**"
  - "packages/shared-ui/**"
---

# Frontend rules

Stack: React 19, TanStack Router (suite-shell routing composed via `@tanstack/virtual-file-routes`), shadcn/ui, Tailwind 4, AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui (v6-paired). See [`DESIGN.md`](../../DESIGN.md) for design tokens and the `packages/shared-ui` contract. `../mastra/packages/playground-ui/` is the reference for chat/upload UX patterns in `apps/web`.

## App-tier boundaries (CI-gated: `pnpm depcruise`)

- **`no-cross-web-app-imports`** — leaf `web-*` apps can't import each other. `web-identity`, `web-notifications`, and `web-agent`'s Ask Seta panel are importable infra; cross-app composition happens only in the `apps/web` shell host.
- **`web-no-backend-imports`** — no web package imports a module's `/backend` or `/db`.

## Styling (CI-gated: `pnpm lint:styles`)

All styling lives in `packages/shared-ui/` — no `.css`, `tailwind.config.*`, or `@theme`/`@layer`/`@apply` anywhere else. The one allowed shim is `apps/web/src/styles/globals.css`.
