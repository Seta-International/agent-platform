// packages/planner/tests/fixtures/golden/plans.ts
import * as C from './constants.ts';

export interface GoldenPlan {
  id: string;
  group_id: string;
  name: string;
}

export interface GoldenBucket {
  id: string;
  plan_id: string;
  name: string;
  order_hint: string;
}

export interface GoldenLabel {
  id: string;
  plan_id: string;
  name: string;
  color: string;
}

export const PLANS: GoldenPlan[] = [
  { id: C.PLAN_ALPHA_ID, group_id: C.GRP_ENG_ID, name: 'Project Alpha' },
  { id: C.PLAN_SPRINT12_ID, group_id: C.GRP_ENG_ID, name: 'Sprint 12' },
  { id: C.PLAN_API_MIG_ID, group_id: C.GRP_ENG_ID, name: 'API Migration' },
  { id: C.PLAN_BETA_ID, group_id: C.GRP_PLAT_ID, name: 'Project Beta' },
  { id: C.PLAN_BILLING_ID, group_id: C.GRP_PLAT_ID, name: 'Billing Overhaul' },
  { id: C.PLAN_INFRA_ID, group_id: C.GRP_DEVOPS_ID, name: 'Infrastructure' },
  { id: C.PLAN_SECURITY_ID, group_id: C.GRP_DEVOPS_ID, name: 'Security Audit' },
  { id: C.PLAN_Q3_ID, group_id: C.GRP_ENG_ID, name: 'Q3 Roadmap' },
];

const ORDER_HINTS = ['a', 'b', 'c', 'd'] as const;

/** Builds the bucket rows for one plan, consuming a contiguous slice of the global index counter. */
function makeBuckets(planId: string, names: string[], startIndex: number): GoldenBucket[] {
  return names.map((name, i) => ({
    id: C.seededId('bucket00', startIndex + i),
    plan_id: planId,
    name,
    order_hint: ORDER_HINTS[i]!,
  }));
}

export const BUCKETS: GoldenBucket[] = [
  ...makeBuckets(C.PLAN_ALPHA_ID, ['Backlog', 'In Progress', 'Review', 'Done'], 1),
  ...makeBuckets(C.PLAN_SPRINT12_ID, ['To Do', 'In Progress', 'Review', 'Done'], 5),
  ...makeBuckets(C.PLAN_API_MIG_ID, ['Planning', 'Active', 'Blocked', 'Complete'], 9),
  ...makeBuckets(C.PLAN_BETA_ID, ['To Do', 'In Progress', 'Done'], 13),
  ...makeBuckets(C.PLAN_BILLING_ID, ['Analysis', 'Development', 'Testing'], 16),
  ...makeBuckets(C.PLAN_INFRA_ID, ['Planned', 'Active', 'Done'], 19),
  ...makeBuckets(C.PLAN_SECURITY_ID, ['Findings', 'Remediation', 'Verified'], 22),
  ...makeBuckets(C.PLAN_Q3_ID, ['Planned', 'Committed', 'Stretch'], 25),
];

export const BUCKET_ALPHA_BACKLOG = BUCKETS[0]!;
export const BUCKET_ALPHA_IN_PROGRESS = BUCKETS[1]!;
export const BUCKET_ALPHA_REVIEW = BUCKETS[2]!;
export const BUCKET_ALPHA_DONE = BUCKETS[3]!;
export const BUCKET_SPRINT12_TODO = BUCKETS[4]!;
export const BUCKET_SPRINT12_IN_PROGRESS = BUCKETS[5]!;
export const BUCKET_SPRINT12_REVIEW = BUCKETS[6]!;
export const BUCKET_SPRINT12_DONE = BUCKETS[7]!;
export const BUCKET_API_MIG_PLANNING = BUCKETS[8]!;
export const BUCKET_API_MIG_ACTIVE = BUCKETS[9]!;
export const BUCKET_API_MIG_BLOCKED = BUCKETS[10]!;
export const BUCKET_API_MIG_COMPLETE = BUCKETS[11]!;

/** Builds the label rows for one plan, consuming a contiguous slice of the global index counter. */
function makeLabels(
  planId: string,
  entries: Array<[string, string]>,
  startIndex: number,
): GoldenLabel[] {
  return entries.map(([name, color], i) => ({
    id: C.seededId('label000', startIndex + i),
    plan_id: planId,
    name,
    color,
  }));
}

export const LABELS: GoldenLabel[] = [
  ...makeLabels(
    C.PLAN_ALPHA_ID,
    [
      ['bug', 'red'],
      ['feature', 'blue'],
      ['docs', 'gray'],
      ['critical', 'red'],
      ['tech-debt', 'yellow'],
      ['performance', 'green'],
    ],
    1,
  ),
  ...makeLabels(
    C.PLAN_SPRINT12_ID,
    [
      ['frontend', 'blue'],
      ['backend', 'green'],
      ['infra', 'orange'],
      ['blocked', 'red'],
    ],
    7,
  ),
  ...makeLabels(
    C.PLAN_API_MIG_ID,
    [
      ['billing', 'green'],
      ['auth', 'blue'],
      ['data', 'purple'],
      ['legacy', 'gray'],
      ['breaking-change', 'red'],
    ],
    11,
  ),
  ...makeLabels(
    C.PLAN_BILLING_ID,
    [
      ['payment', 'green'],
      ['invoice', 'blue'],
      ['schema', 'purple'],
      ['integration', 'orange'],
    ],
    16,
  ),
];
