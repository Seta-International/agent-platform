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
});
