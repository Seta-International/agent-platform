# @seta/shared-config

Shared toolchain configuration — the base `tsconfig`, the
`eslint-plugin-boundaries` ruleset, and the lint guard scripts that
enforce the modular-monolith contract. Used as a `devDependency` by
every other package.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-config/tsconfig.base.json` | Base TS compiler options extended by every workspace |
| `@seta/shared-config/eslint/boundaries` | `eslint-plugin-boundaries` rules — public-surface enforcement |

## Scripts shipped (invoked from repo root)

- `scripts/grep-no-stray-styles.sh` — bans `.css`, `tailwind.config.*`,
  `@theme`/`@layer`/`@apply` outside `@seta/shared-ui`.
