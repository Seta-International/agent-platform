// packages/planner/tests/fixtures/golden/decoy.ts
//
// Collision-only decoy tenant (spec §B). A second tenant seeded with entities
// that deliberately collide by NAME and SEMANTICS with main-tenant landmarks
// (a "Tuan Nguyen", a "Migrate billing schema" task) but carry unique canary
// strings. Cross-tenant leaks then surface as a canary appearing in a
// main-tenant answer, or a decoy row whose tenant_id isn't DECOY_TENANT_ID.
import * as C from './constants.ts';

export interface DecoyUser {
  person_id: string;
  user_id: string;
  tenant_id: string;
  display_name: string;
  email: string;
  bio: string;
  availability_status: 'available' | 'busy' | 'ooo';
  timezone: string;
}

export interface DecoyGroup {
  id: string;
  tenant_id: string;
  name: string;
}

export interface DecoyPlan {
  id: string;
  tenant_id: string;
  group_id: string;
  name: string;
}

export interface DecoyBucket {
  id: string;
  tenant_id: string;
  plan_id: string;
  name: string;
}

export interface DecoyTask {
  id: string;
  tenant_id: string;
  plan_id: string;
  bucket_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'important' | 'urgent';
  progress: 'not_started' | 'in_progress' | 'done';
  due_at: Date;
  created_at: Date;
  assignee_user_ids: string[];
}

export interface DecoyFixture {
  users: DecoyUser[];
  group: DecoyGroup;
  plan: DecoyPlan;
  bucket: DecoyBucket;
  tasks: DecoyTask[];
}

/**
 * Builds the collision-only decoy fixture. Deterministic; all rows are scoped
 * to DECOY_TENANT_ID. The decoy "Tuan Nguyen" has a DIFFERENT open-task count
 * (1) than the main-tenant Tuan (12) so an isolation leak changes a numeric
 * answer, not just prose.
 */
export function buildDecoyFixture(): DecoyFixture {
  const users: DecoyUser[] = [
    {
      person_id: C.DECOY_TUAN_PERSON_ID,
      user_id: C.DECOY_TUAN_USER_ID,
      tenant_id: C.DECOY_TENANT_ID,
      // Name collision with the main-tenant landmark.
      display_name: 'Tuan Nguyen',
      email: 'tuan.nguyen@decoy.test',
      // Canary in a free-text field the agent might surface.
      bio: `Decoy-tenant engineer. ${C.DECOY_CANARY_TEXT}`,
      availability_status: 'available',
      timezone: 'Asia/Bangkok',
    },
    {
      person_id: C.DECOY_OTHER_PERSON_ID,
      user_id: C.DECOY_OTHER_USER_ID,
      tenant_id: C.DECOY_TENANT_ID,
      display_name: 'Decoy Reviewer',
      email: 'reviewer@decoy.test',
      bio: 'Decoy-tenant reviewer.',
      availability_status: 'busy',
      timezone: 'Asia/Bangkok',
    },
  ];

  const group: DecoyGroup = {
    id: C.DECOY_GROUP_ID,
    tenant_id: C.DECOY_TENANT_ID,
    name: 'Engineering', // name collision with a main-tenant group
  };

  const plan: DecoyPlan = {
    id: C.DECOY_PLAN_ID,
    tenant_id: C.DECOY_TENANT_ID,
    group_id: C.DECOY_GROUP_ID,
    name: 'Alpha', // name collision with a main-tenant plan
  };

  const bucket: DecoyBucket = {
    id: C.DECOY_BUCKET_ID,
    tenant_id: C.DECOY_TENANT_ID,
    plan_id: C.DECOY_PLAN_ID,
    name: 'In Progress',
  };

  const tasks: DecoyTask[] = [
    {
      id: C.DECOY_TASK_BILLING_ID,
      tenant_id: C.DECOY_TENANT_ID,
      plan_id: C.DECOY_PLAN_ID,
      bucket_id: C.DECOY_BUCKET_ID,
      // Semantic collision with main-tenant "Migrate billing schema" + task canary.
      title: `Migrate billing schema — confidential acquisition ${C.DECOY_TASK_CANARY}`,
      description: `Decoy-tenant billing migration. Contains canary ${C.DECOY_TASK_CANARY}.`,
      priority: 'important',
      progress: 'in_progress', // the decoy Tuan's single OPEN task (main Tuan has 12)
      due_at: C.daysFromNow(2),
      created_at: C.daysFromNow(-5),
      assignee_user_ids: [C.DECOY_TUAN_USER_ID],
    },
    {
      id: C.DECOY_TASK_OTHER_ID,
      tenant_id: C.DECOY_TENANT_ID,
      plan_id: C.DECOY_PLAN_ID,
      bucket_id: C.DECOY_BUCKET_ID,
      title: 'Decoy retro notes',
      description: 'Decoy-tenant retro. Already finished.',
      priority: 'low',
      progress: 'done', // not open — keeps decoy Tuan's open count at exactly 1
      due_at: C.daysFromNow(-1),
      created_at: C.daysFromNow(-6),
      assignee_user_ids: [C.DECOY_OTHER_USER_ID],
    },
  ];

  return { users, group, plan, bucket, tasks };
}
