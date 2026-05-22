# @seta/shared-ui

The Seta frontend's design system and **style monopoly**. All design
tokens, the Tailwind 4 theme, and every themed shadcn primitive live
here. No other package may ship a `.css` file, a `tailwind.config.*`,
or use `@theme`/`@layer`/`@apply` (one shim allowed at
`apps/web/src/styles/globals.css`). Enforced by `pnpm lint:styles`.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-ui` | Public surface — primitives, composites, hooks |
| `@seta/shared-ui/styles/tokens.css` | CSS variables for colors, spacing, radii, typography |
| `@seta/shared-ui/styles/fonts.css` | `@fontsource/geist-{sans,mono}` declarations |
| `@seta/shared-ui/styles/globals.css` | Base reset + token wiring |

## Token mapping

| DESIGN.md token | CSS variable | Tailwind utility |
|---|---|---|
| `{colors.primary}` | `--color-primary` | `bg-primary`, `text-primary` |
| `{colors.primary-hover}` | `--color-primary-hover` | `hover:bg-primary-hover` |
| `{colors.primary-focus}` | `--color-primary-focus` | `ring-primary-focus` |
| `{colors.canvas}` | `--color-canvas` | `bg-canvas` |
| `{colors.surface-1..4}` | `--color-surface-1..4` | `bg-surface-1` |
| `{colors.hairline}` | `--color-hairline` | `border-hairline` |
| `{colors.ink}` | `--color-ink` | `text-ink` |
| `{colors.ink-muted/subtle/tertiary}` | `--color-ink-*` | `text-ink-subtle` |
| `{spacing.xxs..xxl}` | `--spacing-*` | `p-md`, `gap-lg`, `mt-xl` |
| `{rounded.xs..pill}` | `--radius-*` | `rounded-md`, `rounded-pill` |
| `{typography.body}` | `--text-body` | `text-body` |

shadcn primitives ship referencing their own token names; the generator
sweep rewrites them to DESIGN.md utilities (`bg-background` → `bg-canvas`,
`text-muted-foreground` → `text-ink-subtle`, etc.).
`test/no-shadcn-tokens.test.ts` enforces this — adding a primitive
without sweeping fails CI.

## Extending

- **New primitive:** `pnpm dlx shadcn@4.6.0 add <name>`, then apply the
  substitution table. Add a render test under `src/primitives/<name>.test.tsx`.
- **New variant:** extend the primitive's `cva({ variants })` block and assert the class string.
- **New composite:** write from scratch under `src/composites/`, composed of primitives only.
- **New token:** edit `src/styles/tokens.css`, update the mapping table above, and update `DESIGN.md` if appropriate.
