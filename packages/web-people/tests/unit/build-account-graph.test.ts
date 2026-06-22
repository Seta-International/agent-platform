import { describe, expect, it } from 'vitest';
import type { DeliveryAccount } from '../../src/api/org-client.ts';
import { buildAccountGraph } from '../../src/components/org-chart/build-account-graph.ts';

const accounts: DeliveryAccount[] = [
  {
    account_id: 'a1',
    name: 'Acme',
    am: { person_id: 'am1', full_name: 'AM One' },
    projects: [
      {
        project_id: 'p1',
        name: 'Alpha',
        members: [
          { person_id: 'w1', full_name: 'Lead W', is_lead: true },
          { person_id: 'w2', full_name: 'Dev W', is_lead: false },
        ],
      },
    ],
  },
];

describe('buildAccountGraph', () => {
  it('renders account → projects → members for the selected account', () => {
    const { nodes, edges } = buildAccountGraph(accounts, 'a1');
    expect(nodes.find((n) => n.id === 'acct:a1')?.data.entity).toBe('account');
    expect(nodes.find((n) => n.id === 'acct:a1')?.data.subtitle).toContain('AM One');
    expect(edges.some((e) => e.source === 'acct:a1' && e.target === 'proj:p1')).toBe(true);
    // project node drills to the Project view
    const proj = nodes.find((n) => n.id === 'proj:p1');
    expect(proj?.data.entity).toBe('project');
    expect(proj?.data.nav).toEqual({ view: 'project', projectId: 'p1', accountId: 'a1' });
    const lead = nodes.find((n) => n.id === 'person:p1:w1');
    expect(lead?.data.personId).toBe('w1');
    expect(lead?.data.entity).toBe('person');
    expect(lead?.data.subtitle).toBe('Lead');
    expect(nodes.find((n) => n.id === 'person:p1:w2')?.data.subtitle).toBe('Member');
    expect(edges.some((e) => e.source === 'proj:p1' && e.target === 'person:p1:w1')).toBe(true);
  });

  it('returns an empty graph when the account id is unknown', () => {
    const { nodes } = buildAccountGraph(accounts, 'nope');
    expect(nodes).toHaveLength(0);
  });
});
