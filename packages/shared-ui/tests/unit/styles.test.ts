import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../src/styles/index.css'), 'utf8');

describe('styles/index.css', () => {
  it('declares no theme block — Astryx owns every token', () => {
    expect(css).not.toMatch(/@theme\s*\{/);
    expect(css).not.toMatch(/\.theme-light\s*\{/);
  });

  it('declares no Seta colour tokens', () => {
    for (const t of [
      '--color-primary',
      '--color-canvas',
      '--color-surface-1',
      '--color-ink',
      '--color-hairline',
      '--color-destructive',
      '--color-priority-urgent',
      '--color-group-theme-blue',
    ]) {
      expect(css).not.toContain(t);
    }
  });

  it('loads the neutral theme and the Tailwind bridge', () => {
    expect(css).toContain('@astryxdesign/theme-neutral/theme.css');
    expect(css).toContain('@astryxdesign/core/tailwind-theme.css');
  });

  // The bridge maps Astryx tokens onto Tailwind theme variables; it only works
  // if the theme loads before it and utilities are generated after it.
  it('orders the bridge after the theme and before utilities', () => {
    const theme = css.indexOf('@astryxdesign/theme-neutral/theme.css');
    const bridge = css.indexOf('@astryxdesign/core/tailwind-theme.css');
    const utilities = css.indexOf('tailwindcss/utilities.css');
    expect(theme).toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(theme);
    expect(utilities).toBeGreaterThan(bridge);
  });

  it('still registers the sibling web-* packages as Tailwind sources', () => {
    expect(css).toContain("@source '../../../web-*/src/**/*.{ts,tsx}'");
  });
});
