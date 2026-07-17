import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const primitivesDir = resolve(__dirname, '../../src/primitives');

// Only names shadcn owns exclusively. `bg-card`, `bg-popover`, `bg-muted`,
// `bg-accent`, `bg-secondary` and `border-border` used to sit here too, but the
// Astryx Tailwind bridge now generates all six — forbidding them would ban the
// design system's own vocabulary. shadcn's `-foreground` pairing is the part
// that stayed unique to it.
const FORBIDDEN_CLASSES = [
  'bg-background',
  'text-background',
  'bg-foreground',
  'text-foreground',
  'text-card-foreground',
  'text-popover-foreground',
  'text-muted-foreground',
  'text-secondary-foreground',
  'text-accent-foreground',
  'text-primary-foreground',
  'text-destructive-foreground',
  'border-input',
  'ring-ring',
  'ring-offset-background',
];

describe('shadcn-token override sweep', () => {
  for (const file of readdirSync(primitivesDir).filter((f) => f.endsWith('.tsx'))) {
    it(`${file} contains no shadcn-only token classes`, () => {
      const content = readFileSync(join(primitivesDir, file), 'utf8');
      const found: string[] = [];
      for (const cls of FORBIDDEN_CLASSES) {
        if (content.includes(cls)) found.push(cls);
      }
      expect(found, `${file} still references shadcn tokens: ${found.join(', ')}`).toEqual([]);
    });
  }
});
