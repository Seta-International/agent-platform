import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Button } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const themeCss = readFileSync(require.resolve('@astryxdesign/theme-neutral/theme.css'), 'utf-8');

/** `--name: light-dark(<light>, <dark>);` -> [light, dark]. */
function lightDark(name: string): [string, string] {
  const m = themeCss.match(new RegExp(`${name}\\s*:\\s*light-dark\\(([^,]+),\\s*([^)]+)\\)`));
  const light = m?.[1];
  const dark = m?.[2];
  if (!light || !dark) throw new Error(`${name} is not declared as a light-dark() pair`);
  return [light.trim(), dark.trim()];
}

function channel(hex: string, at: number): number {
  const v = Number.parseInt(hex.replace('#', '').slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
}

function contrast(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

describe('Astryx pipeline smoke test', () => {
  it('renders a themed Astryx Button without throwing', () => {
    render(
      <Theme theme={neutralTheme} mode="light">
        <Button label="Astryx pipeline OK" onClick={() => {}} />
      </Theme>,
    );

    expect(screen.getByRole('button', { name: 'Astryx pipeline OK' })).toBeInTheDocument();
  });

  // Pinning --color-accent while leaving its derived partner alone shipped
  // #001F9D on #0047FF — 1.99:1 — for months, invisible to every other gate.
  // Any future theme must clear AA on this pair in both modes.
  it('keeps accent and on-accent readable against each other in both modes', () => {
    const [accentLight, accentDark] = lightDark('--color-accent');
    const [onLight, onDark] = lightDark('--color-on-accent');

    expect(contrast(onLight, accentLight)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onDark, accentDark)).toBeGreaterThanOrEqual(4.5);
  });
});
