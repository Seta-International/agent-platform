import { expect, it } from 'vitest';
import { loadGoldenCases } from '../../fixtures/golden/loader.ts';

it('all 33 original PQ ids are present in YAML', () => {
  const ids = new Set(loadGoldenCases({ includeAll: true }).map((c) => c.id));
  for (let n = 1; n <= 33; n++) expect(ids.has(`PQ-${String(n).padStart(3, '0')}`)).toBe(true);
});
