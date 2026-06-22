import { describe, expect, it } from 'vitest';
import type { OrgUnitNode } from '../../src/api/org-client.ts';
import { buildStructureGraph } from '../../src/components/org-chart/build-structure-graph.ts';

const units: OrgUnitNode[] = [
  {
    id: 'exec',
    parent_id: null,
    name: 'Executive',
    kind: 'executive',
    sort: 0,
    head: { person_id: 'ceo', full_name: 'CEO' },
    members: [{ person_id: 'ceo', full_name: 'CEO', job_title: 'Chief' }],
  },
  {
    id: 'ops',
    parent_id: 'exec',
    name: 'Operation',
    kind: 'operation',
    sort: 0,
    head: null,
    members: [{ person_id: 'p1', full_name: 'Worker One', job_title: 'Engineer' }],
  },
];

describe('buildStructureGraph', () => {
  it('emits unit + person nodes with parent→unit and unit→member edges', () => {
    const { nodes, edges } = buildStructureGraph(units, new Set());
    expect(nodes.find((n) => n.id === 'unit:exec')?.data.tone).toBe('primary');
    expect(nodes.find((n) => n.id === 'unit:ops')?.data.tone).toBe('solid');
    const p1 = nodes.find((n) => n.id === 'person:p1');
    expect(p1?.data.personId).toBe('p1');
    expect(p1?.data.tone).toBe('surface');
    expect(edges.some((e) => e.source === 'unit:exec' && e.target === 'unit:ops')).toBe(true);
    expect(edges.some((e) => e.source === 'unit:ops' && e.target === 'person:p1')).toBe(true);
    // every node has a laid-out position
    expect(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(
      true,
    );
  });

  it('collapsing a unit hides its members and reports descendantCount', () => {
    const { nodes, edges } = buildStructureGraph(units, new Set(['unit:ops']));
    expect(nodes.find((n) => n.id === 'person:p1')).toBeUndefined();
    expect(edges.some((e) => e.target === 'person:p1')).toBe(false);
    expect(nodes.find((n) => n.id === 'unit:ops')?.data.descendantCount).toBe(1);
    expect(nodes.find((n) => n.id === 'unit:ops')?.data.collapsed).toBe(true);
  });
});
