import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(resolve(__dirname, '../src/styles/tokens.css'), 'utf8');

describe('tokens.css', () => {
  it('declares Seta-blue primary palette (D23)', () => {
    expect(tokens).toMatch(/--color-primary:\s*#0047FF/i);
    expect(tokens).toMatch(/--color-primary-hover:\s*#1A3CFF/i);
    expect(tokens).toMatch(/--color-primary-focus:\s*#022DAD/i);
  });

  it('declares canvas + surface ladder', () => {
    for (const t of [
      '--color-canvas',
      '--color-surface-1',
      '--color-surface-2',
      '--color-surface-3',
      '--color-surface-4',
    ]) {
      expect(tokens).toContain(t);
    }
  });

  it('declares hairline triplet', () => {
    expect(tokens).toContain('--color-hairline:');
    expect(tokens).toContain('--color-hairline-strong:');
    expect(tokens).toContain('--color-hairline-tertiary:');
  });

  it('declares the ink ladder', () => {
    for (const t of [
      '--color-ink',
      '--color-ink-muted',
      '--color-ink-subtle',
      '--color-ink-tertiary',
    ]) {
      expect(tokens).toContain(t);
    }
  });

  it('declares Phase-A default tokens (on-primary, destructive)', () => {
    expect(tokens).toMatch(/--color-on-primary:\s*#ffffff/i);
    expect(tokens).toMatch(/--color-destructive:\s*#e5484d/i);
  });

  it('declares the spacing scale', () => {
    for (const t of [
      '--spacing-xxs',
      '--spacing-xs',
      '--spacing-sm',
      '--spacing-md',
      '--spacing-lg',
      '--spacing-xl',
      '--spacing-xxl',
      '--spacing-section',
    ]) {
      expect(tokens).toContain(t);
    }
  });

  it('declares the radius scale', () => {
    for (const t of [
      '--radius-xs',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--radius-xxl',
      '--radius-pill',
      '--radius-full',
    ]) {
      expect(tokens).toContain(t);
    }
  });

  it('declares the typography ladder', () => {
    for (const t of [
      '--text-display-xl',
      '--text-display-lg',
      '--text-display-md',
      '--text-headline',
      '--text-card-title',
      '--text-subhead',
      '--text-body-lg',
      '--text-body',
      '--text-body-sm',
      '--text-caption',
      '--text-button',
      '--text-eyebrow',
      '--text-mono',
    ]) {
      expect(tokens).toContain(t);
    }
  });

  it('declares font families', () => {
    expect(tokens).toMatch(/--font-display:\s*['"]Inter['"]/);
    expect(tokens).toMatch(/--font-mono:\s*['"]JetBrains Mono['"]/);
  });

  it('declares a `.theme-light` swap', () => {
    expect(tokens).toMatch(/\.theme-light\s*\{/);
  });
});
