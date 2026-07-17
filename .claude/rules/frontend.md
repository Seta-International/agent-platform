---
paths:
  - "apps/web/**"
  - "packages/web-*/**"
  - "packages/shared-ui/**"
---

# Frontend rules

Stack: React 19, TanStack Router (suite-shell routing composed via `@tanstack/virtual-file-routes`), Astryx (`@astryxdesign/core` + StyleX, custom `seta` theme in `packages/shared-ui/src/theme/`) for components, Tailwind 4, AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui (v6-paired). Every `shared-ui` primitive is an Astryx re-export, and all UI — including `apps/web` — is built on them. The only deliberate non-Astryx UI deps are recharts (no Astryx charts) and lucide (icons). See [`DESIGN.md`](../../DESIGN.md) for design tokens and the `packages/shared-ui` contract. `../mastra/packages/playground-ui/` is the reference for chat/upload UX patterns in `apps/web`.

## App-tier boundaries (CI-gated: `pnpm depcruise`)

- **`no-cross-web-app-imports`** — leaf `web-*` apps can't import each other. `web-identity`, `web-notifications`, and `web-agent`'s Ask Seta panel are importable infra; cross-app composition happens only in the `apps/web` shell host.
- **`web-no-backend-imports`** — no web package imports a module's `/backend` or `/db`.

## Styling (CI-gated: `pnpm lint:styles`)

All styling lives in `packages/shared-ui/` — no `.css`, `tailwind.config.*`, or `@theme`/`@layer`/`@apply` anywhere else. The one allowed shim is `apps/web/src/styles/globals.css`.

## Use the primitive, never hand-roll the native element

**Never write a raw interactive or typographic HTML element in a `web-*` package or `apps/web`.** Import the primitive from `@seta/shared-ui` instead — it is the Astryx component under the repo's own name:

| Don't hand-roll | Use |
| --- | --- |
| `<button>` | `Button` (icon-only → `IconButton`) |
| `<input>` | `Input`, or `Checkbox` / `RadioGroup` / `FileInput` / `DateInput` / `NumberInput` |
| `<textarea>` | `Textarea` |
| `<h1>`–`<h6>` | `Heading level={n}` |
| `<table>` | `Table` |
| `<label>` | nothing — Astryx fields self-label via their required `label` prop |

A raw element styled with Tailwind (`<button className="rounded px-2 py-1.5 …">`) is the specific anti-pattern: it bypasses the design system **and** puts styling outside `shared-ui`, so it violates the rule above too. Layout classes on a *surrounding wrapper* remain fine.

**When auditing a surface, grep for the lowercase native tag (`<button`, `<input`), not just the component name.** A file whose imports look fully migrated can still hand-roll its markup — searching for `<Button` will never match a `<button>`.

Escape hatches, in order: a component prop → a `style`/`className` with tokens (`var(--color-*|--spacing-*|--radius-*)`) → `xstyle`. If a primitive genuinely cannot express it, say so in review rather than reaching for a raw element.

## Astryx design system

**Repo-specific override of the block below** (as of FUT-562's foundation change): the StyleX
compiler IS wired here (`@stylexjs/unplugin` in `apps/web/vite.config.ts` and
`packages/shared-ui/.storybook/main.ts`) — `xstyle` is the supported override mechanism, contrary
to the block's claim. Do NOT import `@astryxdesign/core/astryx.css` (or `reset.css`) into any real
app entry point yet — it's wired into Storybook only
(`packages/shared-ui/.storybook/preview.css`), deliberately isolated because the vendor
stylesheet's unscoped `:root` token defaults collide with Seta's own tokens. See
[`DESIGN.md`](../../DESIGN.md)'s `implementation_notice` for why.

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
