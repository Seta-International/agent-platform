import { expect, it } from 'vitest';
import { checkEmbeddingInvariants } from '../../fixtures/golden/oracles/preflight.ts';

const MAIN = '00000000-aaaa-0000-0000-000000000001';
const DECOY = '00000000-aaaa-0000-0000-000000000002';
const MODEL = 'openai:text-embedding-3-small';

function baseParams() {
  return {
    label: 'tasks',
    mainTenantId: MAIN,
    decoyTenantId: DECOY,
    entityIds: { main: ['t1', 't2'], decoy: ['d1'] },
    expected: { mainExpectedRows: 2, decoyExpectedRows: 1 },
    expectedModelId: MODEL,
    rows: [
      { entityId: 't1', tenantId: MAIN, modelId: MODEL },
      { entityId: 't2', tenantId: MAIN, modelId: MODEL },
      { entityId: 'd1', tenantId: DECOY, modelId: MODEL },
    ],
  };
}

it('passes when every searchable entity has exactly one correctly-tenanted embedding', () => {
  expect(checkEmbeddingInvariants(baseParams())).toEqual([]);
});

it('flags an orphan embedding whose entity is not in the seeded set', () => {
  const p = baseParams();
  p.rows.push({ entityId: 'ghost', tenantId: MAIN, modelId: MODEL });
  p.expected.mainExpectedRows = 3;
  const v = checkEmbeddingInvariants(p);
  expect(v.some((x) => /orphan/i.test(x) && x.includes('ghost'))).toBe(true);
});

it('flags a missing embedding for a seeded entity', () => {
  const p = baseParams();
  p.rows = p.rows.filter((r) => r.entityId !== 't2');
  p.expected.mainExpectedRows = 1;
  const v = checkEmbeddingInvariants(p);
  expect(v.some((x) => x.includes('t2'))).toBe(true);
});

it('flags a cross-tenant leak (decoy entity embedded under the main tenant)', () => {
  const p = baseParams();
  p.rows = [
    { entityId: 't1', tenantId: MAIN, modelId: MODEL },
    { entityId: 't2', tenantId: MAIN, modelId: MODEL },
    { entityId: 'd1', tenantId: MAIN, modelId: MODEL }, // leaked into main
  ];
  const v = checkEmbeddingInvariants(p);
  expect(v.length).toBeGreaterThan(0);
});

it('flags a wrong model id', () => {
  const p = baseParams();
  p.rows = [
    { entityId: 't1', tenantId: MAIN, modelId: 'openai:text-embedding-3-large' },
    { entityId: 't2', tenantId: MAIN, modelId: MODEL },
    { entityId: 'd1', tenantId: DECOY, modelId: MODEL },
  ];
  const v = checkEmbeddingInvariants(p);
  expect(v.some((x) => /model/i.test(x))).toBe(true);
});

it('flags a row-count mismatch versus the expected manifest counts', () => {
  const p = baseParams();
  p.expected.mainExpectedRows = 99;
  const v = checkEmbeddingInvariants(p);
  expect(v.some((x) => /count/i.test(x))).toBe(true);
});
