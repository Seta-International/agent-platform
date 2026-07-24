import { describe, expect, it } from 'vitest';
import type { CompanyNode, DeliveryAccount, OrgUnitNode } from '../../src/api/org-client.ts';
import { buildCompanyGraph } from '../../src/components/org-chart/build-company-graph.ts';
import { buildDepartmentGraph } from '../../src/components/org-chart/build-department-graph.ts';
import { buildDeliveryHierarchy } from '../../src/components/org-chart/delivery-nodes.ts';

const sampleAccounts: DeliveryAccount[] = [
  {
    account_id: 'a1',
    name: 'Acme Corp',
    am: { person_id: 'p1', full_name: 'AM One' },
    projects: [
      {
        project_id: 'proj1',
        name: 'Project Alpha',
        members: [{ person_id: 'm1', full_name: 'Worker One', is_lead: true }],
      },
    ],
  },
  {
    account_id: 'a2',
    name: 'Beta Inc',
    am: { person_id: 'p1', full_name: 'AM One' },
    projects: [],
  },
  {
    account_id: 'a3',
    name: 'Gamma LLC',
    am: null,
    projects: [],
  },
];

const sampleUnits: OrgUnitNode[] = [
  {
    id: 'u-exec',
    parent_id: null,
    name: 'Executive',
    kind: 'executive',
    sort: 1,
    head: null,
    members: [],
  },
  {
    id: 'u-del',
    parent_id: 'u-exec',
    name: 'Delivery Department',
    kind: 'delivery',
    sort: 2,
    head: null,
    members: Array.from({ length: 150 }, (_, i) => ({
      person_id: `mem-${i}`,
      full_name: `Engineer ${i}`,
      job_title: 'Software Engineer',
    })),
  },
  {
    id: 'u-bo',
    parent_id: 'u-exec',
    name: 'Back Office',
    kind: 'function',
    sort: 3,
    head: null,
    members: [
      { person_id: 'bo1', full_name: 'BO Staff One', job_title: 'HR Manager' },
      { person_id: 'bo2', full_name: 'BO Staff Two', job_title: 'Accountant' },
    ],
  },
  {
    id: 'u-sub-parent',
    parent_id: 'u-exec',
    name: 'Operations',
    kind: 'operation',
    sort: 4,
    head: null,
    members: [],
  },
  {
    id: 'u-sub-child',
    parent_id: 'u-sub-parent',
    name: 'Logistics',
    kind: 'function',
    sort: 1,
    head: { person_id: 'head1', full_name: 'Logistics Head' },
    members: [],
  },
];

describe('buildDepartmentGraph', () => {
  it('renders Delivery department using buildDeliveryHierarchy without ancestor chains', () => {
    const { nodes, edges } = buildDepartmentGraph(sampleUnits, 'u-del', sampleAccounts);

    // Root node is Delivery itself
    const root = nodes.find((n) => n.id === 'u-del');
    expect(root).toBeDefined();
    expect(root?.data.title).toBe('Delivery Department');

    // No ancestor node (e.g. Executive) should be rendered
    expect(nodes.some((n) => n.id === 'u-exec')).toBe(false);

    // AM node (AM One) exists under Delivery
    const amNode = nodes.find((n) => n.id === 'am:p1');
    expect(amNode).toBeDefined();
    expect(amNode?.data.title).toBe('AM One');
    expect(amNode?.data.personId).toBe('p1');
    expect(edges.some((e) => e.source === 'u-del' && e.target === 'am:p1')).toBe(true);

    // Account A1 & A2 hanging under AM One
    expect(edges.some((e) => e.source === 'am:p1' && e.target === 'acct:a1')).toBe(true);
    expect(edges.some((e) => e.source === 'am:p1' && e.target === 'acct:a2')).toBe(true);

    // Account A3 (no AM) hangs directly under Delivery
    expect(edges.some((e) => e.source === 'u-del' && e.target === 'acct:a3')).toBe(true);

    // 150 members assigned to u-del in DB must NOT be rendered as flat person nodes
    expect(nodes.some((n) => n.id.startsWith('member:u-del:'))).toBe(false);
  });

  it('renders empty node when Delivery department has zero accounts', () => {
    const { nodes, edges } = buildDepartmentGraph(sampleUnits, 'u-del', []);

    expect(nodes).toHaveLength(2); // Delivery root + empty node
    expect(nodes.some((n) => n.id === 'empty:u-del')).toBe(true);
    expect(edges.some((e) => e.source === 'u-del' && e.target === 'empty:u-del')).toBe(true);
  });

  it('renders non-Delivery department with direct members', () => {
    const { nodes, edges } = buildDepartmentGraph(sampleUnits, 'u-bo', []);

    expect(nodes.find((n) => n.id === 'u-bo')).toBeDefined();
    expect(nodes.some((n) => n.id === 'member:u-bo:bo1')).toBe(true);
    expect(nodes.some((n) => n.id === 'member:u-bo:bo2')).toBe(true);
    expect(edges).toHaveLength(2);
  });

  it('renders non-Delivery department with child sub-departments and heads', () => {
    const { nodes, edges } = buildDepartmentGraph(sampleUnits, 'u-sub-parent', []);

    expect(nodes.find((n) => n.id === 'u-sub-parent')).toBeDefined();
    expect(nodes.find((n) => n.id === 'u-sub-child')).toBeDefined();
    expect(nodes.find((n) => n.id === 'head:u-sub-child:head1')).toBeDefined();
    expect(edges.some((e) => e.source === 'u-sub-parent' && e.target === 'u-sub-child')).toBe(true);
    expect(
      edges.some((e) => e.source === 'u-sub-child' && e.target === 'head:u-sub-child:head1'),
    ).toBe(true);
  });

  it('guarantees delivery hierarchy subtree consistency with Company View', () => {
    const companyNodes: CompanyNode[] = [
      { id: 'unit:u-exec', parent_id: null, kind: 'executive', label: 'Executive' },
      { id: 'unit:u-del', parent_id: 'unit:u-exec', kind: 'delivery', label: 'Delivery' },
      { id: 'am:p1', parent_id: 'unit:u-del', kind: 'am', label: 'AM One', person_id: 'p1' },
      {
        id: 'account:a1',
        parent_id: 'am:p1',
        kind: 'account',
        label: 'Acme Corp',
        count: 1,
        account_id: 'a1',
      },
    ];

    const companyGraph = buildCompanyGraph(companyNodes);
    const deptGraph = buildDepartmentGraph(sampleUnits, 'u-del', sampleAccounts);

    // In both views, AM One (p1) is connected to Delivery root
    const companyAmEdge = companyGraph.edges.find((e) => e.target === 'am:p1');
    const deptAmEdge = deptGraph.edges.find((e) => e.target === 'am:p1');

    expect(companyAmEdge).toBeDefined();
    expect(deptAmEdge).toBeDefined();
    expect(deptAmEdge?.source).toBe('u-del');
  });
});

describe('buildDeliveryHierarchy', () => {
  it('deduplicates AMs and builds correct parent-child relationships', () => {
    const { nodes, edges } = buildDeliveryHierarchy('root-unit', sampleAccounts);

    expect(nodes.filter((n) => n.id.startsWith('am:'))).toHaveLength(1);
    expect(nodes.filter((n) => n.id.startsWith('acct:'))).toHaveLength(3);
    expect(edges.filter((e) => e.source === 'root-unit')).toHaveLength(2); // am:p1 and acct:a3
    expect(edges.filter((e) => e.source === 'am:p1')).toHaveLength(2); // acct:a1 and acct:a2
  });
});
