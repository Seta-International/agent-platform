// packages/planner/tests/fixtures/golden/organization.ts
import * as C from './constants.ts';
import { GENERATED_PEOPLE } from './people.ts';

export interface GoldenGroup {
  id: string;
  name: string;
  visibility: 'private' | 'public';
  theme: string;
}

export interface GoldenMembership {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
}

export interface GoldenOrgUnit {
  id: string;
  name: string;
  kind: string;
  sort: number;
}

// ---------------------------------------------------------------------------
// Groups — 4 groups.
// ---------------------------------------------------------------------------

export const GROUPS: GoldenGroup[] = [
  { id: C.GRP_ENG_ID, name: 'Engineering', visibility: 'private', theme: 'blue' },
  { id: C.GRP_PLAT_ID, name: 'Platform', visibility: 'private', theme: 'green' },
  { id: C.GRP_DEVOPS_ID, name: 'DevOps', visibility: 'private', theme: 'orange' },
  { id: C.GRP_MKT_ID, name: 'Marketing', visibility: 'public', theme: 'purple' },
];

// ---------------------------------------------------------------------------
// Memberships — named people first, then generated people distributed by
// index range. See plan for the exact per-group headcount requirements.
// ---------------------------------------------------------------------------

const NAMED_MEMBERSHIPS: GoldenMembership[] = [
  // Actor: owner of Engineering, member of Platform, member of DevOps.
  // NOT in Marketing — asserted by a later RBAC scope test.
  { group_id: C.GRP_ENG_ID, user_id: C.ACTOR_USER_ID, role: 'owner' },
  { group_id: C.GRP_PLAT_ID, user_id: C.ACTOR_USER_ID, role: 'member' },
  { group_id: C.GRP_DEVOPS_ID, user_id: C.ACTOR_USER_ID, role: 'member' },

  // Engineering members
  { group_id: C.GRP_ENG_ID, user_id: C.USER_TUAN_ID, role: 'member' },
  { group_id: C.GRP_ENG_ID, user_id: C.USER_LINH_ID, role: 'member' },
  { group_id: C.GRP_ENG_ID, user_id: C.USER_DUC_ID, role: 'member' },
  { group_id: C.GRP_ENG_ID, user_id: C.USER_THANH_ID, role: 'member' },
  { group_id: C.GRP_ENG_ID, user_id: C.USER_NAM_ID, role: 'member' },

  // Platform members
  { group_id: C.GRP_PLAT_ID, user_id: C.USER_MINH_ID, role: 'member' },
  { group_id: C.GRP_PLAT_ID, user_id: C.USER_LAN_ID, role: 'member' },

  // Hoa: cross-functional — Engineering AND Platform
  { group_id: C.GRP_ENG_ID, user_id: C.USER_HOA_ID, role: 'member' },
  { group_id: C.GRP_PLAT_ID, user_id: C.USER_HOA_ID, role: 'member' },

  // DevOps members
  { group_id: C.GRP_DEVOPS_ID, user_id: C.USER_CHI_ID, role: 'member' },
  { group_id: C.GRP_DEVOPS_ID, user_id: C.USER_KHOA_ID, role: 'member' },

  // Marketing member
  { group_id: C.GRP_MKT_ID, user_id: C.USER_THAO_ID, role: 'member' },
];

/** Generated-people index ranges mapped to their target group. */
const GENERATED_GROUP_RANGES: { start: number; end: number; group_id: string }[] = [
  { start: 0, end: 7, group_id: C.GRP_ENG_ID }, // 8 people
  { start: 8, end: 14, group_id: C.GRP_PLAT_ID }, // 7 people
  { start: 15, end: 19, group_id: C.GRP_DEVOPS_ID }, // 5 people
  { start: 20, end: 23, group_id: C.GRP_MKT_ID }, // 4 people
  // indices 24-37 (14 people): no group membership (alumni/pre-boarding)
];

const GENERATED_MEMBERSHIPS: GoldenMembership[] = GENERATED_GROUP_RANGES.flatMap(
  ({ start, end, group_id }) =>
    GENERATED_PEOPLE.slice(start, end + 1).map(
      (person): GoldenMembership => ({
        group_id,
        user_id: person.user_id,
        role: 'member',
      }),
    ),
);

export const MEMBERSHIPS: GoldenMembership[] = [...NAMED_MEMBERSHIPS, ...GENERATED_MEMBERSHIPS];

// ---------------------------------------------------------------------------
// Org units — 3 org units.
// ---------------------------------------------------------------------------

export const ORG_UNITS: GoldenOrgUnit[] = [
  { id: C.seededId('orgunit0', 1), name: 'Engineering Division', kind: 'delivery', sort: 1 },
  { id: C.seededId('orgunit0', 2), name: 'Platform Division', kind: 'delivery', sort: 2 },
  { id: C.seededId('orgunit0', 3), name: 'Operations Division', kind: 'operation', sort: 3 },
];
