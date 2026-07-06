import { listSkills } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { addPersonSkill, getWorkerIdForUser } from '@seta/people';
import {
  applyLabelsByName,
  createBucket,
  createGroup,
  createPlan,
  createTask,
} from '@seta/planner';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { resolveTenantId } from './lib/tenant-resolve.ts';
import { buildAdminSession } from './seed.ts';

const log = pino({ name: 'cli/demo-suggestions' });

const GROUP_NAME = 'AI Suggestions Demo';
const PLAN_NAME = 'AI Suggestions Demo Board';
const BUCKET_NAME = 'To do';

/**
 * Demo members and the catalog skills they get. Emails are real seeded users;
 * skills are all present in the seeded core.skill catalog. addPersonSkill is
 * onConflictDoNothing, so re-running is safe.
 */
const MEMBERS: Array<{ email: string; skills: string[] }> = [
  { email: 'hung.vu@seta-international.vn', skills: ['React', 'TypeScript'] },
  { email: 'canh.ta@seta-international.vn', skills: ['Python', 'PostgreSQL'] },
  { email: 'son.tran@seta-international.vn', skills: ['AWS', 'Kubernetes', 'Docker'] },
  { email: 'anh.nguyennhat@seta-international.vn', skills: ['Figma'] },
  // Overlapping skills so tasks rank several competing candidates.
  { email: 'an.do@seta-international.vn', skills: ['React', 'Node.js'] },
  { email: 'anh.dao@seta-international.vn', skills: ['React', 'TypeScript'] },
  { email: 'anh.le@seta-international.vn', skills: ['Python', 'AWS'] },
  { email: 'anh.ngotuan@seta-international.vn', skills: ['Go', 'Docker'] },
  { email: 'anh.nguyen@seta-international.vn', skills: ['Java', 'PostgreSQL'] },
  { email: 'anh.nguyenviet@seta-international.vn', skills: ['Figma', 'TypeScript'] },
];

/**
 * Tasks that exercise every path of the assignee-suggestion engine. The exact
 * branch (heaviest weight) matches a task's *labels* against member skills, so
 * label-bearing tasks produce deterministic strong matches with no embeddings.
 * The last few tasks deliberately omit labels / description to verify the
 * label-less (vector) path and the graceful "sparse signal" tooltip.
 */
const TASKS: Array<{ title: string; labels: string[]; description?: string }> = [
  {
    title: 'Build the React onboarding dashboard',
    labels: ['React', 'TypeScript'],
    description: 'Responsive dashboard in React + TypeScript with hooks, routing and charts.',
  },
  {
    title: 'Design the Python ETL pipeline',
    labels: ['Python', 'PostgreSQL'],
    description: 'Batch ETL job in Python that transforms and loads into PostgreSQL.',
  },
  {
    // Edge case: missing description — exact label match still drives the score.
    title: 'Provision the AWS EKS cluster',
    labels: ['AWS', 'Kubernetes'],
  },
  {
    // Edge case: missing labels — relies on the vector branch over task text.
    title: 'Redesign the mobile onboarding screens in Figma',
    labels: [],
    description: 'High-fidelity Figma mockups and a component library for mobile onboarding.',
  },
  {
    // Edge case: missing labels AND description — sparse signal, weak/empty matches.
    title: 'Fix the flaky login test',
    labels: [],
  },
  {
    title: 'Containerize services with Docker',
    labels: ['Docker'],
    description: 'Author Dockerfiles and a compose stack for local development.',
  },
];

async function findId(query: ReturnType<typeof sql>): Promise<string | null> {
  const res = await coreDb().execute(query);
  return (res.rows[0] as { id?: string } | undefined)?.id ?? null;
}

async function resolveUserId(tenantId: string, email: string): Promise<string> {
  const id = await findId(sql`
    SELECT id FROM identity."user"
    WHERE tenant_id = ${tenantId} AND lower(email) = lower(${email}) LIMIT 1`);
  if (!id) throw new Error(`No user with email ${email} in tenant ${tenantId}`);
  return id;
}

export async function demoSuggestionsCommand(opts: {
  tenant: string;
  adminEmail: string;
}): Promise<void> {
  const tenantId = await resolveTenantId(opts.tenant);
  const session = await buildAdminSession(tenantId, opts.adminEmail);

  // Resolve members → { userId, personId } and grant catalog skills.
  const skillCatalog = new Map(
    (await listSkills(session)).map((s) => [s.name.toLowerCase(), s.id] as const),
  );
  const memberUserIds: string[] = [];
  for (const m of MEMBERS) {
    const userId = await resolveUserId(tenantId, m.email);
    memberUserIds.push(userId);
    const personId = await getWorkerIdForUser(userId, tenantId);
    if (!personId) {
      log.warn({ email: m.email }, 'no worker record — skipping skill grant');
      continue;
    }
    for (const skillName of m.skills) {
      const skillId = skillCatalog.get(skillName.toLowerCase());
      if (!skillId) {
        log.warn({ skillName }, 'skill absent from catalog — skipping');
        continue;
      }
      await addPersonSkill({ person_id: personId, skill_id: skillId, session });
    }
    log.info({ email: m.email, skills: m.skills }, 'skills granted');
  }

  // Find-or-create the board (group + plan + bucket).
  let groupId = await findId(sql`
    SELECT id FROM planner.groups
    WHERE tenant_id = ${tenantId} AND name = ${GROUP_NAME} AND deleted_at IS NULL LIMIT 1`);
  if (!groupId) {
    const group = await createGroup({
      tenant_id: tenantId,
      name: GROUP_NAME,
      description: 'Sandbox board for testing inline assignee suggestions.',
      initial_members: memberUserIds.map((user_id) => ({ user_id, role: 'member' as const })),
      session,
    });
    groupId = group.id;
    log.info({ groupId }, 'group created');
  } else {
    log.info({ groupId }, 'group exists — reusing');
  }

  let planId = await findId(sql`
    SELECT id FROM planner.plans
    WHERE tenant_id = ${tenantId} AND group_id = ${groupId}::uuid
      AND name = ${PLAN_NAME} AND deleted_at IS NULL LIMIT 1`);
  if (!planId) {
    const plan = await createPlan({ group_id: groupId, name: PLAN_NAME, session });
    planId = plan.id;
    log.info({ planId }, 'plan created');
  } else {
    log.info({ planId }, 'plan exists — reusing');
  }

  let bucketId = await findId(sql`
    SELECT id FROM planner.buckets
    WHERE plan_id = ${planId}::uuid AND name = ${BUCKET_NAME} AND deleted_at IS NULL LIMIT 1`);
  if (!bucketId) {
    const bucket = await createBucket({ plan_id: planId, name: BUCKET_NAME, session });
    bucketId = bucket.id;
  }

  // Create the demo tasks (skip ones already present by title).
  for (const t of TASKS) {
    const existing = await findId(sql`
      SELECT id FROM planner.tasks
      WHERE plan_id = ${planId}::uuid AND title = ${t.title} AND deleted_at IS NULL LIMIT 1`);
    if (existing) {
      log.info({ title: t.title }, 'task exists — skipping');
      continue;
    }
    const task = await createTask({
      plan_id: planId,
      bucket_id: bucketId,
      title: t.title,
      description: t.description,
      session,
    });
    if (t.labels.length > 0) {
      await applyLabelsByName({ plan_id: planId, task_id: task.id, names: t.labels, session });
    }
    log.info({ title: t.title, labels: t.labels }, 'task created');
  }

  log.info(
    { board: PLAN_NAME, members: memberUserIds.length, tasks: TASKS.length },
    'demo-suggestions seed complete',
  );
}
