import { describe, expect, it } from 'vitest';
import type { DeliveryAccount } from '../../src/api/org-client.ts';
import { buildProjectGraph } from '../../src/components/org-chart/build-project-graph.ts';

const accounts: DeliveryAccount[] = [
  {
    account_id: 'a1',
    name: 'Acme',
    am: { person_id: 'am1', full_name: 'AM One' },
    projects: [
      {
        project_id: 'p1',
        name: 'Alpha',
        members: [{ person_id: 'w1', full_name: 'Lead W', is_lead: true }],
      },
    ],
  },
];

describe('buildProjectGraph', () => {
  it('renders the selected project box → member nodes', () => {
    const { nodes, edges } = buildProjectGraph(accounts, 'p1');
    expect(nodes.find((n) => n.id === 'proj:p1')?.data.title).toBe('Alpha');
    const m = nodes.find((n) => n.id === 'person:p1:w1');
    expect(m?.data.personId).toBe('w1');
    expect(edges.some((e) => e.source === 'proj:p1' && e.target === 'person:p1:w1')).toBe(true);
  });

  it('returns an empty graph when the project id is unknown', () => {
    expect(buildProjectGraph(accounts, 'nope').nodes).toHaveLength(0);
  });
});
