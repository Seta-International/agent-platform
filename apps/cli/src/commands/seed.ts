import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { coreTenants } from '@seta/core/db/schema';
import { emit, withEmit } from '@seta/core/events';
import { createUser, grantRole, listRoleGrants } from '@seta/identity';
import {
  addChecklistItem,
  addGroupMember,
  applyLabel,
  assignTask,
  type BucketRow,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  type GroupRow,
  type LabelRow,
  type PlanRow,
} from '@seta/planner';
import { sql } from 'drizzle-orm';
import pino from 'pino';

const log = pino({ name: 'cli/seed' });

const DEMO_TENANT_SLUG = 'acme-corp';
const DEMO_TENANT_NAME = 'Acme Corp';
const ADMIN_EMAIL = 'alice@acme-corp.example';

// Deterministic pseudo-random using sine-based hash — no extra deps.
function seededRand(seed: number): number {
  return Math.abs(Math.sin(seed * 9301 + 49297) * 233280) % 1;
}

type SeedRng = { next: () => number };

function makeRng(baseSeed: number): SeedRng {
  let counter = baseSeed;
  return {
    next() {
      counter++;
      return seededRand(counter);
    },
  };
}

function pick<T>(arr: T[], rng: SeedRng): T {
  const item = arr[Math.floor(rng.next() * arr.length)];
  if (item === undefined) throw new Error('pick called on empty array');
  return item;
}

function pickN<T>(arr: T[], n: number, rng: SeedRng): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng.next() * copy.length);
    const item = copy.splice(idx, 1)[0];
    if (item !== undefined) result.push(item);
  }
  return result;
}

interface SeedUser {
  name: string;
  email: string;
  skills: string[];
  userId: string;
}

interface GroupDef {
  name: string;
  memberCount: number;
  plans: string[];
}

const USER_DEFS: Array<{ name: string; localPart: string; skills: string[] }> = [
  { name: 'Alice Nguyen', localPart: 'alice', skills: ['terraform', 'kubernetes'] },
  { name: 'Bob Chen', localPart: 'bob', skills: ['react', 'typescript'] },
  { name: 'Carol Smith', localPart: 'carol', skills: ['python', 'data'] },
  { name: 'Dan Park', localPart: 'dan', skills: ['design', 'figma'] },
  { name: 'Eve Johnson', localPart: 'eve', skills: ['ops', 'aws'] },
  { name: 'Frank Lee', localPart: 'frank', skills: ['react', 'typescript'] },
  { name: 'Grace Kim', localPart: 'grace', skills: ['python', 'data'] },
  { name: 'Henry Liu', localPart: 'henry', skills: ['terraform', 'aws'] },
  { name: 'Ivy Tran', localPart: 'ivy', skills: ['design', 'figma'] },
  { name: 'Jack Moore', localPart: 'jack', skills: ['kubernetes', 'ops'] },
  { name: 'Kate Davis', localPart: 'kate', skills: ['react', 'typescript'] },
  { name: 'Liam Wilson', localPart: 'liam', skills: ['python', 'data'] },
];

const GROUP_DEFS: GroupDef[] = [
  {
    name: 'Engineering',
    memberCount: 5,
    plans: ['Q2 Infrastructure', 'Frontend Revamp', 'Backend API v2'],
  },
  {
    name: 'Marketing',
    memberCount: 3,
    plans: ['Q2 Campaign', 'Brand Refresh'],
  },
  {
    name: 'Operations',
    memberCount: 4,
    plans: ['Process Automation', 'Cost Optimisation', 'Onboarding Revamp'],
  },
];

const BUCKET_NAMES = ['To do', 'In progress', 'Review', 'Done'];

// Weighted bucket distribution: 40% To do, 30% In progress, 20% Review, 10% Done.
const BUCKET_WEIGHTS = [40, 30, 20, 10];

function pickBucketIndex(rng: SeedRng): number {
  const roll = rng.next() * 100;
  let acc = 0;
  for (let i = 0; i < BUCKET_WEIGHTS.length; i++) {
    acc += BUCKET_WEIGHTS[i] ?? 0;
    if (roll < acc) return i;
  }
  return BUCKET_WEIGHTS.length - 1;
}

function pickPriority(rng: SeedRng): 'urgent' | 'important' | 'medium' | 'low' {
  // ~10% urgent, ~25% important, ~45% medium, ~20% low
  const roll = rng.next() * 100;
  if (roll < 10) return 'urgent';
  if (roll < 35) return 'important';
  if (roll < 80) return 'medium';
  return 'low';
}

const TASK_TITLE_TEMPLATES: string[] = [
  'Set up {thing} pipeline',
  'Implement {thing} feature',
  'Fix {thing} bug',
  'Review {thing} PR',
  'Update {thing} documentation',
  'Refactor {thing} module',
  'Deploy {thing} to production',
  'Write tests for {thing}',
  'Investigate {thing} performance',
  'Design {thing} architecture',
  'Migrate {thing} to new system',
  'Onboard {thing} integration',
  'Audit {thing} access control',
  'Optimise {thing} query',
  'Configure {thing} alerts',
  'Create {thing} dashboard',
  'Schedule {thing} review meeting',
  'Analyse {thing} metrics',
  'Automate {thing} workflow',
  'Validate {thing} outputs',
];

const TASK_THINGS: Record<string, string[]> = {
  Engineering: [
    'CI/CD',
    'auth service',
    'database',
    'API gateway',
    'caching layer',
    'observability',
    'load balancer',
    'infra cost',
    'microservice',
    'queue consumer',
  ],
  Marketing: [
    'email campaign',
    'landing page',
    'social media',
    'A/B test',
    'SEO',
    'analytics',
    'brand guide',
    'content calendar',
    'ad copy',
    'newsletter',
  ],
  Operations: [
    'onboarding flow',
    'vendor contract',
    'SLA policy',
    'runbook',
    'incident process',
    'cost report',
    'backup schedule',
    'access review',
    'change management',
    'tooling audit',
  ],
};

const CHECKLIST_ITEMS: Record<string, string[]> = {
  Engineering: [
    'Write unit tests',
    'Update README',
    'Add monitoring',
    'Code review complete',
    'Deploy to staging',
  ],
  Marketing: ['Stakeholder sign-off', 'Copy proofread', 'Assets uploaded', 'Schedule confirmed'],
  Operations: ['Approval received', 'Runbook updated', 'Team notified', 'Rollback plan ready'],
};

const LABEL_DEFS: Array<{ name: string; color: string }> = [
  { name: 'bug', color: '#e5484d' },
  { name: 'feature', color: '#5e6ad2' },
  { name: 'docs', color: '#30a46c' },
  { name: 'infra', color: '#f76b15' },
  { name: 'urgent', color: '#e5484d' },
];

// ISO date offset by days from today.
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function buildAdminSession(
  tenantId: string,
  userId: string,
  email: string,
): Promise<SessionScope> {
  const { grants } = await listRoleGrants(userId);
  const role_summary = rollup(grants);
  return {
    session_id: `cli-seed-${userId}`,
    user_id: userId,
    tenant_id: tenantId,
    email,
    display_name: email,
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: computeAccessibleGroups(grants),
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
  };
}

export async function seedCommand(): Promise<void> {
  const rng = makeRng(42);

  // Step 1: Drop and re-create the demo tenant.
  log.info({ slug: DEMO_TENANT_SLUG }, 'seed: dropping existing demo tenant if present');
  await coreDb().execute(sql`DELETE FROM core.tenants WHERE slug = ${DEMO_TENANT_SLUG}`);

  const tenantId = crypto.randomUUID();
  log.info({ tenantId, slug: DEMO_TENANT_SLUG }, 'seed: creating tenant');

  await withEmit({ actor: { userId: 'cli', tenantId } }, async (tx) => {
    await tx.insert(coreTenants).values({
      id: tenantId,
      name: DEMO_TENANT_NAME,
      slug: DEMO_TENANT_SLUG,
      idle_timeout_days: 30,
    });
    await emit({
      tenantId,
      aggregateType: 'core.tenant',
      aggregateId: tenantId,
      eventType: 'core.tenant.created',
      eventVersion: 1,
      payload: { tenantId, name: DEMO_TENANT_NAME, slug: DEMO_TENANT_SLUG },
    });
  });

  // Step 2: Create 12 users. Alice is org.admin.
  log.info('seed: creating users');
  const seedUsers: SeedUser[] = [];
  for (const def of USER_DEFS) {
    const email = `${def.localPart}@acme-corp.example`;
    const isAdmin = def.localPart === 'alice';
    const { user_id } = await createUser(
      {
        tenant_id: tenantId,
        email,
        name: def.name,
        password: `Changeme1!${def.localPart}`,
        ...(isAdmin
          ? { initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null } }
          : {}),
      },
      { type: 'cli', user_id: null },
    );
    seedUsers.push({ name: def.name, email, skills: def.skills, userId: user_id });
    log.info({ email, user_id }, 'seed: user created');
  }

  // Resolve Alice (org.admin) as the acting session for all planner writes.
  const alice = seedUsers.find((u) => u.email === ADMIN_EMAIL);
  if (!alice) throw new Error(`Admin user ${ADMIN_EMAIL} not found after creation`);
  const session = await buildAdminSession(tenantId, alice.userId, alice.email);

  // Grant planner.contributor to all non-admin users so they appear in assignment lists.
  const nonAdminUsers = seedUsers.filter((u) => u.userId !== alice.userId);
  for (const u of nonAdminUsers) {
    await grantRole(
      {
        user_id: u.userId,
        tenant_id: tenantId,
        role_slug: 'planner.contributor',
        scope_type: 'tenant',
        scope_id: null,
      },
      { type: 'cli', user_id: null },
    );
  }

  // Step 3: Create groups, add members, create plans, buckets, labels, tasks.
  let userCursor = 0;

  for (const groupDef of GROUP_DEFS) {
    log.info({ group: groupDef.name }, 'seed: creating group');
    const group: GroupRow = await createGroup({
      tenant_id: tenantId,
      name: groupDef.name,
      session,
    });

    // Assign members (pick from the pool in round-robin order, including alice).
    const memberPool = [alice, ...nonAdminUsers];
    const members: SeedUser[] = [];
    for (let i = 0; i < groupDef.memberCount; i++) {
      const member = memberPool[userCursor % memberPool.length];
      if (!member) break;
      userCursor++;
      if (!members.find((m) => m.userId === member.userId)) {
        members.push(member);
        await addGroupMember({ group_id: group.id, user_id: member.userId, session });
      }
    }

    const groupThings = TASK_THINGS[groupDef.name] ?? TASK_THINGS.Engineering ?? ['task'];
    const groupChecklists = CHECKLIST_ITEMS[groupDef.name] ??
      CHECKLIST_ITEMS.Engineering ?? ['Done'];

    for (const planName of groupDef.plans) {
      log.info({ plan: planName, group: groupDef.name }, 'seed: creating plan');
      const plan: PlanRow = await createPlan({ group_id: group.id, name: planName, session });

      // Create 4 default buckets.
      const buckets: BucketRow[] = [];
      for (const bucketName of BUCKET_NAMES) {
        const bucket = await createBucket({ plan_id: plan.id, name: bucketName, session });
        buckets.push(bucket);
      }

      // Create labels for this plan.
      const planLabels: LabelRow[] = [];
      for (const labelDef of LABEL_DEFS) {
        const label = await createLabel({
          plan_id: plan.id,
          name: labelDef.name,
          color: labelDef.color,
          session,
        });
        planLabels.push(label);
      }

      // Distribute tasks across this plan's buckets.
      // Engineering gets ~14 tasks/plan, Marketing ~12, Operations ~12.
      const taskCount = groupDef.name === 'Engineering' ? 14 : 12;

      for (let ti = 0; ti < taskCount; ti++) {
        const bucketIdx = pickBucketIndex(rng);
        const bucket = buckets[bucketIdx] ?? buckets[0];
        if (!bucket) throw new Error('No buckets created for plan');
        const titleTemplate = pick(TASK_TITLE_TEMPLATES, rng);
        const thing = pick(groupThings, rng);
        const title = titleTemplate.replace('{thing}', thing);

        // Skill tags: ~40% chance of 1-2 tags drawn from member skills.
        let skill_tags: string[] = [];
        if (rng.next() < 0.4) {
          const allSkills = Array.from(new Set(members.flatMap((m) => m.skills)));
          const tagCount = rng.next() < 0.5 ? 1 : 2;
          skill_tags = pickN(allSkills, tagCount, rng);
        }

        // review_state: ~10% 'needs_review'.
        const review_state: 'needs_review' | undefined =
          rng.next() < 0.1 ? 'needs_review' : undefined;

        // due_at: ~30% have a date; of those, ~30% are overdue.
        let due_at: string | undefined;
        if (rng.next() < 0.3) {
          const overdue = rng.next() < 0.3;
          due_at = overdue
            ? isoOffset(-Math.floor(rng.next() * 14 + 1))
            : isoOffset(Math.floor(rng.next() * 30 + 1));
        }

        const priority = pickPriority(rng);

        const task = await createTask({
          plan_id: plan.id,
          bucket_id: bucket.id,
          title,
          priority,
          skill_tags: skill_tags.length > 0 ? skill_tags : undefined,
          review_state,
          due_at,
          session,
        });

        // Assignees: ~20% unassigned, ~60% one assignee, ~20% two assignees.
        const assignmentRoll = rng.next();
        if (assignmentRoll < 0.6) {
          const assignee = pick(members, rng);
          await assignTask({ task_id: task.id, user_id: assignee.userId, session });
        } else if (assignmentRoll < 0.8) {
          const assignees = pickN(members, 2, rng);
          for (const assignee of assignees) {
            await assignTask({ task_id: task.id, user_id: assignee.userId, session });
          }
        }
        // else: ~20% unassigned — no action.

        // Checklist: ~25% chance of 2-4 items.
        if (rng.next() < 0.25) {
          const itemCount = 2 + Math.floor(rng.next() * 3);
          for (let ci = 0; ci < itemCount; ci++) {
            const label = pick(groupChecklists, rng);
            await addChecklistItem({ task_id: task.id, label, session });
          }
        }

        // Labels: ~5% chance of 1-2 labels applied.
        if (rng.next() < 0.05 && planLabels.length > 0) {
          const labelCount = rng.next() < 0.5 ? 1 : 2;
          const chosenLabels = pickN(planLabels, labelCount, rng);
          for (const label of chosenLabels) {
            await applyLabel({ task_id: task.id, label_id: label.id, session });
          }
        }
      }
    }
  }

  log.info({ tenantId, slug: DEMO_TENANT_SLUG }, 'seed: complete');
  process.stdout.write(
    `${JSON.stringify({
      tenant_id: tenantId,
      slug: DEMO_TENANT_SLUG,
      users: seedUsers.length,
      groups: GROUP_DEFS.length,
    })}\n`,
  );
}
