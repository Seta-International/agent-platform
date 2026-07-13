import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

// Brand values verified against the live seta-international.com HTML/CSS
// (see docs/superpowers/specs/2026-07-13-astryx-design-system-migration-design.md,
// "Branding" section) — #0047FF is mode-invariant in the current design
// system, so it's the same in both light and dark here too.
export const setaTheme = defineTheme({
  name: 'seta',
  extends: neutralTheme,
  color: {
    // Seed only — `color.accent` drives a derived, contrast-adjusted scale
    // (confirmed: seeding '#0047FF' here compiles to '#0045FD', not the
    // literal hex). The `tokens` block below pins the exact verified value.
    accent: '#0047FF',
    neutralStyle: 'warm',
  },
  typography: {
    body: { family: 'Geist', fallbacks: '-apple-system, system-ui, sans-serif' },
    heading: { family: 'Geist', fallbacks: '-apple-system, system-ui, sans-serif' },
    code: { family: 'Geist Mono', fallbacks: 'ui-monospace, SF Mono, Menlo, monospace' },
  },
  radius: {
    base: 4,
    multiplier: 1,
  },
  tokens: {
    // Explicit overrides always win over the scale-generated value (per
    // `astryx docs theme`) — pins the literal, verified brand hex instead of
    // the derived '#0045FD'. Mode-invariant: same hex in light and dark,
    // matching tokens.css's current --color-primary today.
    '--color-accent': ['#0047FF', '#0047FF'],
  },
});
