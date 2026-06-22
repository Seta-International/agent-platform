import { describe, expect, it } from 'vitest';
import type { DeliveryAccount } from '../../src/api/org-client.ts';
import { buildDeliveryGraph } from '../../src/components/org-chart/build-delivery-graph.ts';

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

describe('buildDeliveryGraph', () => {
  it('accounts level: one node per account, drillTo its account', () => {
    const { nodes } = buildDeliveryGraph(accounts, { level: 'accounts' });
    const a = nodes.find((n) => n.id === 'acct:a1');
    expect(a?.data.avatarShape).toBe('square');
    expect(a?.data.subtitle).toContain('AM One');
    expect(a?.data.drillTo).toEqual({ level: 'account', accountId: 'a1' });
  });

  it('account level: account → project nodes, project drillTo project', () => {
    const { nodes, edges } = buildDeliveryGraph(accounts, { level: 'account', accountId: 'a1' });
    expect(nodes.find((n) => n.id === 'proj:p1')?.data.drillTo).toEqual({
      level: 'project',
      accountId: 'a1',
      projectId: 'p1',
    });
    expect(edges.some((e) => e.source === 'acct:a1' && e.target === 'proj:p1')).toBe(true);
  });

  it('project level: project → member person nodes, lead marked', () => {
    const { nodes } = buildDeliveryGraph(accounts, {
      level: 'project',
      accountId: 'a1',
      projectId: 'p1',
    });
    const lead = nodes.find((n) => n.id === 'person:w1');
    expect(lead?.data.personId).toBe('w1');
    expect(lead?.data.subtitle).toBe('Lead');
    expect(nodes.find((n) => n.id === 'person:w2')?.data.subtitle).toBe('Member');
  });
});
