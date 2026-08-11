import { describe, expect, it } from 'vitest';
import type { CompanyNode, DeliveryAccount, OrgUnitNode } from '../../src/api/org-client.ts';
import { buildAccountGraph } from '../../src/components/org-chart/build-account-graph.ts';
import { buildCompanyGraph } from '../../src/components/org-chart/build-company-graph.ts';
import { buildDepartmentGraph } from '../../src/components/org-chart/build-department-graph.ts';

const PHOTO = '/api/people/v1/workers/p-photo/photo';

const units: OrgUnitNode[] = [
  {
    id: 'u-root',
    parent_id: null,
    name: 'Engineering',
    kind: 'function',
    sort: 1,
    head: null,
    members: [
      { person_id: 'p-photo', full_name: 'Ada Lovelace', job_title: 'Engineer', photo_url: PHOTO },
      { person_id: 'p-none', full_name: 'Grace Hopper', job_title: 'Architect', photo_url: null },
    ],
  },
  {
    id: 'u-parent',
    parent_id: null,
    name: 'Operations',
    kind: 'function',
    sort: 2,
    head: null,
    members: [],
  },
  {
    id: 'u-child',
    parent_id: 'u-parent',
    name: 'Facilities',
    kind: 'function',
    sort: 3,
    head: { person_id: 'p-photo', full_name: 'Ada Lovelace', photo_url: PHOTO },
    members: [],
  },
];

const accounts: DeliveryAccount[] = [
  {
    account_id: 'a1',
    name: 'Acme Corp',
    am: { person_id: 'p-photo', full_name: 'Ada Lovelace', photo_url: PHOTO },
    projects: [
      {
        project_id: 'proj1',
        name: 'Project Alpha',
        members: [
          { person_id: 'p-photo', full_name: 'Ada Lovelace', is_lead: true, photo_url: PHOTO },
          { person_id: 'p-none', full_name: 'Grace Hopper', is_lead: false, photo_url: null },
        ],
      },
    ],
  },
];

describe('org chart node photos', () => {
  it('department member nodes carry the photo as avatarSrc, and omit it when there is none', () => {
    const { nodes } = buildDepartmentGraph(units, 'u-root');
    const withPhoto = nodes.find((n) => n.data.title === 'Ada Lovelace');
    const without = nodes.find((n) => n.data.title === 'Grace Hopper');
    expect(withPhoto?.data.avatarSrc).toBe(PHOTO);
    expect(without?.data.avatarSrc).toBeUndefined();
  });

  it('sub-department head nodes carry the photo', () => {
    const { nodes } = buildDepartmentGraph(units, 'u-parent');
    const head = nodes.find((n) => n.data.subtitle === 'Head');
    expect(head?.data.avatarSrc).toBe(PHOTO);
  });

  it('company-tree account-manager nodes carry the photo', () => {
    const companyNodes: CompanyNode[] = [
      { id: 'unit:u1', parent_id: null, kind: 'delivery', label: 'Delivery' },
      {
        id: 'am:p-photo',
        parent_id: 'unit:u1',
        kind: 'am',
        label: 'Ada Lovelace',
        sublabel: 'Account Manager',
        person_id: 'p-photo',
        photo_url: PHOTO,
      },
    ];
    const { nodes } = buildCompanyGraph(companyNodes);
    expect(nodes.find((n) => n.id === 'am:p-photo')?.data.avatarSrc).toBe(PHOTO);
    expect(nodes.find((n) => n.id === 'unit:u1')?.data.avatarSrc).toBeUndefined();
  });

  it('account-view AM and project member nodes carry the photo', () => {
    const { nodes } = buildAccountGraph(accounts, 'a1');
    expect(nodes.find((n) => n.id === 'am:p-photo')?.data.avatarSrc).toBe(PHOTO);
    expect(nodes.find((n) => n.id === 'person:proj1:p-photo')?.data.avatarSrc).toBe(PHOTO);
    expect(nodes.find((n) => n.id === 'person:proj1:p-none')?.data.avatarSrc).toBeUndefined();
  });
});
