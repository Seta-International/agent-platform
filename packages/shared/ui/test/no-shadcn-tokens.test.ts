import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const primitivesDir = resolve(__dirname, '../src/primitives');

const FORBIDDEN_CLASSES = [
  'bg-background',
  'text-background',
  'bg-foreground',
  'text-foreground',
  'bg-card',
  'text-card-foreground',
  'bg-popover',
  'text-popover-foreground',
  'bg-muted',
  'text-muted-foreground',
  'bg-secondary ',
  'text-secondary-foreground',
  'bg-accent',
  'text-accent-foreground',
  'text-primary-foreground',
  'text-destructive-foreground',
  'border-input',
  'border-border',
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
