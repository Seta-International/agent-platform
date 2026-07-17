---
version: alpha
name: Seta-design-system
description: "Astryx's `neutral` theme, unmodified. Seta ships no custom theme,
  no brand accent, and no token layer of its own: `@astryxdesign/theme-neutral`
  is loaded as-is and its Tailwind bridge maps every token onto utilities. The
  palette is achromatic — the accent is near-black on light and near-white on
  dark — so colour carries only status (error/success/warning), never brand."

implementation_notice: |
  The authoritative source is the compiled vendor CSS, not this file and not the
  Astryx docs. `pnpm exec astryx docs tokens` documents the SYSTEM defaults in
  `@astryxdesign/core/astryx.css`; `theme-neutral` overrides most of them inside
  an `@scope` block. When they disagree, read
  `node_modules/@astryxdesign/theme-neutral/dist/theme.css`. Do not `grep -o` it
  — that flattens the `@scope` blocks and reports scoped values as root ones.

  Everything loads from `packages/shared-ui/src/styles/index.css` (18 lines, zero
  tokens). There is no theme build step and no generated CSS.
---

# Type

Astryx's geometric scale: `round(14 × 1.2^step)`. Seta adds no sizes.

| Utility | Size | Role |
| --- | --- | --- |
| `text-xs` | 10px | eyebrows, dense labels |
| `text-sm` | 12px | captions, supporting/meta text |
| `text-base` | 14px | **body — the default** |
| `text-lg` | 17px | section titles |
| `text-xl` | 20px | subheads |
| `text-2xl` | 24px | card titles |
| `text-3xl` | 29px | headlines |
| `text-5xl` | 42px | display |

**Never use `text-body`.** Astryx declares `--text-body-size` but no `--text-body`,
so Tailwind resolves the name through the *colour* namespace and paints text in
the page background — invisible, and it compiles clean. The same trap applies to
any name that is both a type role and a background. `text-base` is body.

`text-card` and `text-surface` are colours, not sizes — legitimate for light text
on a dark chip (see `GraphNodeCard`), never for typography.

Utilities give size only. Where weight or leading matters, set `font-*`
explicitly, or use Astryx's `<Text type="...">` / `<Heading level={n}>`, which
carry the size+weight+leading triplet and are preferred for new code.

**No arbitrary font sizes.** `text-[11px]` and friends are off-scale by
definition; the scale above is the whole vocabulary.

# Spacing

Astryx's 4px scale, which Tailwind's numeric utilities map onto 1:1 — the bridge
sets `--spacing: var(--spacing-1)` and `--spacing-1` is `4px`, exactly Tailwind's
own default. So `p-6` is 24px and `gap-3` is 12px, as anywhere else.

The scale **includes half-steps**: `--spacing-0-5` (2px) and `--spacing-1-5`
(6px). Per Astryx, use steps 0.5–2 for tight internal spacing and 4–8 for section
gaps. `gap-1.5` between an icon and its label is correct, not drift.

Stick to the scale. If a value isn't on it, reconsider the design.

# Page frame

`<PageContainer>` from `@seta/shared-ui` is the page shell: 1180px, `p-6`
gutters, centred. Pages do not hand-roll `mx-auto` + `max-w-*`.

The product is desktop-only in practice — there is one responsive spacing
utility in the entire repo. Don't add breakpoints speculatively.

# Radius

Astryx's `radius.base: 4` scale. `rounded-sm` 6px (inner), `rounded-md` 10px
(element). These are theme-neutral's values, not the system defaults the docs
table shows.

# Colour

Achromatic by decision. The accent is `light-dark(#262626, #ebebeb)` and carries
no brand meaning; chromatic colour is reserved for status. A consequence worth
knowing: any surface that signalled importance through a blue accent now reads
grey, and a red destructive action will out-shout a grey primary one. Fix that
with hierarchy and weight, not by reintroducing a brand hue.

Never override `--color-*` in `:root`. Never pin one half of a derived contrast
pair — pinning `--color-accent` while leaving `--color-on-accent` computed
shipped a 1.99:1 contrast failure for months.

# Guards

`packages/shared-ui/tests/unit/styles-compiled.test.ts` compiles the real
stylesheet and fails if any `text-*` class used in source generates no rule.
Source-level tests cannot see a class that silently stopped existing — that is
how 433 elements lost their font-size with every gate green.
