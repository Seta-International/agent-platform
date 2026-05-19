# @seta/shared-ui

The Seta frontend's design system and style monopoly. All design tokens,
Tailwind 4 configuration, and themed primitives live in this package. No
other package may ship a `.css` file, a `tailwind.config.*`, or use
`@theme`/`@layer`/`@apply`.

## Anchors

- Design source: `DESIGN.md` at repo root (Linear-flavored; chromatic accent re-anchored to Seta blue per D23).
- Foundation spec: `docs/superpowers/specs/2026-05-19-frontend-foundation-design.md`.
- Boundary rule: `architecture.md §J.4` + repo-root `.dependency-cruiser.cjs`.
- CI gate: `pnpm lint:styles` (`packages/shared/config/scripts/grep-no-stray-styles.sh`).

## Token mapping — DESIGN.md token ↔ Tailwind utility

| DESIGN.md token | CSS variable | Tailwind utility example |
|---|---|---|
| `{colors.primary}` | `--color-primary` | `bg-primary`, `text-primary` |
| `{colors.primary-hover}` | `--color-primary-hover` | `hover:bg-primary-hover` |
| `{colors.primary-focus}` | `--color-primary-focus` | `ring-primary-focus` |
| `{colors.canvas}` | `--color-canvas` | `bg-canvas` |
| `{colors.surface-1..4}` | `--color-surface-1..4` | `bg-surface-1` |
| `{colors.hairline}` | `--color-hairline` | `border-hairline` |
| `{colors.ink}` | `--color-ink` | `text-ink` |
| `{colors.ink-muted/subtle/tertiary}` | `--color-ink-muted` etc. | `text-ink-subtle` |
| `{spacing.xxs..xxl}` | `--spacing-xxs..xxl` | `p-md`, `gap-lg`, `mt-xl` |
| `{rounded.xs..pill}` | `--radius-xs..pill` | `rounded-md`, `rounded-pill` |
| `{typography.body}` | `--text-body` (+ line-height + letter-spacing) | `text-body` |

## shadcn override sweep

Generated shadcn primitives reference their own token names
(`bg-background`, `text-primary-foreground`, `border-input`, `ring-ring`).
On install we sweep every primitive file and rewrite to DESIGN.md
utilities — no alias bridge.

| shadcn class | → | DESIGN.md class |
|---|---|---|
| `bg-background` | → | `bg-canvas` |
| `text-foreground` | → | `text-ink` |
| `bg-card` | → | `bg-surface-1` |
| `bg-popover` | → | `bg-surface-2` |
| `bg-muted` | → | `bg-surface-2` |
| `text-muted-foreground` | → | `text-ink-subtle` |
| `text-primary-foreground` | → | `text-on-primary` |
| `bg-secondary` | → | `bg-surface-1` |
| `text-secondary-foreground` | → | `text-ink` |
| `bg-accent` | → | `bg-primary-hover` |
| `border-input`, `border-border` | → | `border-hairline` |
| `ring-ring` | → | `ring-primary-focus` |

`test/no-shadcn-tokens.test.ts` enforces this — adding a primitive
without sweeping will fail CI.

## DESIGN.md follow-ups (open)

These tokens ship with Phase-A defaults pending a `DESIGN.md` extension PR:

- `colors.on-primary` = `#ffffff`.
- `colors.destructive` = `#e5484d` (Radix red-9); `colors.on-destructive` = `#ffffff`.
- `colors.brand-secure` repurposed as a neutral gray (`#475467`) since
  Linear's lavender-gray surface isn't part of Seta's chrome.

## Extending the library

- **New primitive:** `pnpm dlx shadcn@4.6.0 add <name>`, then apply the
  substitution table to the generated file. Add a render test under
  `src/primitives/<name>.test.tsx` confirming the default-variant
  DESIGN.md tokens appear in the className.
- **New variant on an existing primitive:** extend the primitive's
  `cva({ variants: { ... } })` block. Add a test asserting the new
  variant's class string.
- **New composite:** write it from scratch under `src/composites/`,
  composed of existing primitives only. Add a render test.
- **New token:** edit `src/styles/tokens.css`. Update this README's
  mapping table. Update `DESIGN.md` if appropriate.
