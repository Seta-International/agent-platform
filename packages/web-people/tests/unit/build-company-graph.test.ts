import { describe, expect, it } from 'vitest';
import type { CompanyNode } from '../../src/api/org-client.ts';
import { buildCompanyGraph } from '../../src/components/org-chart/build-company-graph.ts';

const sample: CompanyNode[] = [
  { id: 'unit:exec', parent_id: null, kind: 'executive', label: 'Executive' },
  { id: 'unit:ops', parent_id: 'unit:exec', kind: 'operation', label: 'Operation' },
  { id: 'unit:bo', parent_id: 'unit:ops', kind: 'function', label: 'Back Office', count: 3 },
  { id: 'unit:del', parent_id: 'unit:exec', kind: 'delivery', label: 'Delivery' },
  {
    id: 'am:p1',
    parent_id: 'unit:del',
    kind: 'am',
    label: 'AM One',
    sublabel: 'Account Manager',
    person_id: 'p1',
  },
  {
    id: 'account:a1',
    parent_id: 'am:p1',
    kind: 'account',
    label: 'Acme',
    count: 2,
    account_id: 'a1',
  },
];

describe('buildCompanyGraph', () => {
  it('maps each node and draws one edge per non-null parent_id', () => {
    const { nodes, edges } = buildCompanyGraph(sample);

    // executive box: primary tone, square, no person name carried
    const exec = nodes.find((n) => n.id === 'unit:exec')!;
    expect(exec.data.tone).toBe('primary');
    expect(exec.data.avatarShape).toBe('square');
    expect(exec.data.title).toBe('Executive');
    expect(exec.data.personId).toBeUndefined();

    // function box keeps its count
    expect(nodes.find((n) => n.id === 'unit:bo')!.data.count).toBe(3);

    // AM node is a clickable circle carrying personId
    const am = nodes.find((n) => n.id === 'am:p1')!;
    expect(am.data.avatarShape).toBe('circle');
    expect(am.data.personId).toBe('p1');

    // account node is a square carrying accountId
    const acct = nodes.find((n) => n.id === 'account:a1')!;
    expect(acct.data.avatarShape).toBe('square');
    expect(acct.data.accountId).toBe('a1');

    // edges: one per non-null parent_id (exec has none)
    expect(edges).toHaveLength(5);
    expect(edges.some((e) => e.source === 'unit:exec' && e.target === 'unit:ops')).toBe(true);
    expect(edges.some((e) => e.source === 'unit:del' && e.target === 'am:p1')).toBe(true);
    expect(edges.some((e) => e.source === 'am:p1' && e.target === 'account:a1')).toBe(true);

    // no person leaves, and every node is laid out
    expect(nodes.some((n) => n.id.startsWith('person:'))).toBe(false);
    expect(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(
      true,
    );
  });
});
