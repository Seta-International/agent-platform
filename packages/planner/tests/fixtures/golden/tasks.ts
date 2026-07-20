// packages/planner/tests/fixtures/golden/tasks.ts
import * as C from './constants.ts';
import { GENERATED_PEOPLE } from './people.ts';
import {
  BUCKET_ALPHA_BACKLOG,
  BUCKET_ALPHA_DONE,
  BUCKET_ALPHA_IN_PROGRESS,
  BUCKET_ALPHA_REVIEW,
  BUCKET_API_MIG_ACTIVE,
  BUCKET_API_MIG_COMPLETE,
  BUCKET_API_MIG_PLANNING,
  BUCKET_SPRINT12_DONE,
  BUCKET_SPRINT12_IN_PROGRESS,
  BUCKET_SPRINT12_REVIEW,
  BUCKET_SPRINT12_TODO,
  BUCKETS,
  type GoldenBucket,
  type GoldenLabel,
  LABELS,
} from './plans.ts';

export interface GoldenTask {
  id: string;
  plan_id: string;
  bucket_id: string;
  title: string;
  description: string;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  progress: 'not_started' | 'in_progress' | 'done';
  due_at: Date | null;
  created_at: Date;
  assignee_user_ids: string[];
  label_ids: string[];
}

export interface GoldenComment {
  id: string;
  task_id: string;
  author_user_id: string;
  body: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

const ALPHA_CRITICAL_LABEL = LABELS.find(
  (l) => l.plan_id === C.PLAN_ALPHA_ID && l.name === 'critical',
)!;

const BILLING_DEVELOPMENT_BUCKET = BUCKETS.find(
  (b) => b.plan_id === C.PLAN_BILLING_ID && b.name === 'Development',
)!;

// ---------------------------------------------------------------------------
// Step 1 — 11 key specimen tasks
// ---------------------------------------------------------------------------

export const KEY_TASKS: GoldenTask[] = [
  {
    id: C.TASK_API_RATE_LIMIT_ID,
    plan_id: C.PLAN_ALPHA_ID,
    bucket_id: BUCKET_ALPHA_IN_PROGRESS.id,
    title: 'API Rate Limit Fix',
    description:
      'Implement rate limiting on /api/v2 endpoints using token bucket algorithm. Need to decide between per-endpoint and global rate limits. Current traffic patterns show /search at 10x other endpoints.',
    priority: 'urgent',
    progress: 'in_progress',
    due_at: C.daysFromNow(3),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_TUAN_ID],
    label_ids: [ALPHA_CRITICAL_LABEL.id],
  },
  {
    id: C.TASK_BILLING_SCHEMA_ID,
    plan_id: C.PLAN_API_MIG_ID,
    bucket_id: BUCKET_API_MIG_PLANNING.id,
    title: 'Migrate billing schema',
    description:
      'Migrate the billing schema to support multi-currency. Requires adding currency_code to invoice_items and updating the foreign key cascade from payments to invoices.',
    priority: 'important',
    progress: 'not_started',
    due_at: C.daysFromNow(5),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_LINH_ID],
    label_ids: [],
  },
  {
    id: C.TASK_DATA_MIG_ID,
    plan_id: C.PLAN_API_MIG_ID,
    bucket_id: BUCKET_API_MIG_ACTIVE.id,
    title: 'Data migration pipeline',
    description:
      'Build ETL pipeline to migrate 2M records from legacy billing system. Using batch processing with checkpointing for fault tolerance.',
    priority: 'important',
    progress: 'in_progress',
    due_at: C.daysFromNow(7),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_HOA_ID],
    label_ids: [],
  },
  {
    id: C.TASK_AUTH_MIG_ID,
    plan_id: C.PLAN_API_MIG_ID,
    bucket_id: BUCKET_API_MIG_PLANNING.id,
    title: 'Auth migration',
    description:
      'Migrate authentication endpoints from v1 to v2. Update JWT token format and refresh token rotation policy.',
    priority: 'medium',
    progress: 'not_started',
    due_at: C.daysFromNow(10),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_DUC_ID],
    label_ids: [],
  },
  {
    id: C.TASK_LEGACY_MIG_ID,
    plan_id: C.PLAN_API_MIG_ID,
    bucket_id: BUCKET_API_MIG_COMPLETE.id,
    title: 'Legacy migration cleanup',
    description:
      'Remove deprecated v0 migration scripts and clean up temporary tables created during the 2024 migration.',
    priority: 'low',
    progress: 'done',
    due_at: C.daysFromNow(-3),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_NAM_ID],
    label_ids: [],
  },
  {
    id: C.TASK_PAYMENT_GW_ID,
    plan_id: C.PLAN_BILLING_ID,
    bucket_id: BILLING_DEVELOPMENT_BUCKET.id,
    title: 'Update payment gateway',
    description:
      'Upgrade Stripe SDK from v10 to v14. Handle breaking changes in PaymentIntent API and update webhook handlers for new event format.',
    priority: 'important',
    progress: 'in_progress',
    due_at: C.daysFromNow(4),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_LAN_ID],
    label_ids: [],
  },
  {
    id: C.TASK_FIX_LOGIN_ID,
    plan_id: C.PLAN_ALPHA_ID,
    bucket_id: BUCKET_ALPHA_IN_PROGRESS.id,
    title: 'Fix login bug',
    description:
      'Users getting 403 on login when MFA is enabled but not configured. Root cause: middleware checks mfa_verified flag before checking if MFA is set up.',
    priority: 'urgent',
    progress: 'in_progress',
    due_at: C.daysFromNow(1),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_TUAN_ID],
    label_ids: [],
  },
  {
    id: C.TASK_UPDATE_DOCS_ID,
    plan_id: C.PLAN_ALPHA_ID,
    bucket_id: BUCKET_ALPHA_BACKLOG.id,
    title: 'Update docs',
    description:
      'Update API documentation for the new rate limiting headers. Add examples for X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset.',
    priority: 'medium',
    progress: 'not_started',
    due_at: C.daysFromNow(2),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_LINH_ID],
    label_ids: [],
  },
  {
    id: C.TASK_REVIEW_PR_ID,
    plan_id: C.PLAN_ALPHA_ID,
    bucket_id: BUCKET_ALPHA_IN_PROGRESS.id,
    title: 'Review PR #42',
    description:
      'Code review for the authentication refactor PR. Focus on token rotation logic and session management changes.',
    priority: 'important',
    progress: 'not_started',
    due_at: C.daysFromNow(0),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.ACTOR_USER_ID],
    label_ids: [],
  },
  {
    id: C.TASK_WRITE_TESTS_ID,
    plan_id: C.PLAN_ALPHA_ID,
    bucket_id: BUCKET_ALPHA_BACKLOG.id,
    title: 'Write unit tests',
    description:
      'Add unit tests for the new billing calculation module. Cover multi-currency conversion, rounding rules, and tax calculation edge cases.',
    priority: 'medium',
    progress: 'not_started',
    due_at: C.daysFromNow(1),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.ACTOR_USER_ID],
    label_ids: [],
  },
  {
    id: C.TASK_DEPLOY_V2_ID,
    plan_id: C.PLAN_ALPHA_ID,
    bucket_id: BUCKET_ALPHA_REVIEW.id,
    title: 'Deploy service v2',
    description:
      'Deploy v2 of the API service to staging. Includes blue-green deployment strategy with automatic rollback on health check failure.',
    priority: 'important',
    progress: 'not_started',
    due_at: C.daysFromNow(4),
    created_at: C.daysFromNow(-10),
    assignee_user_ids: [C.USER_TUAN_ID],
    label_ids: [],
  },
];

// ---------------------------------------------------------------------------
// Step 2 — Generated background tasks
// ---------------------------------------------------------------------------

const TITLE_TEMPLATES = [
  'Implement {0} endpoint',
  'Fix {0} rendering',
  'Add {0} tests',
  'Refactor {0} module',
  'Update {0} configuration',
  'Optimize {0} queries',
  'Add {0} validation',
  'Fix {0} memory leak',
  'Implement {0} caching',
  'Add {0} logging',
  'Update {0} dependencies',
  'Fix {0} timeout',
  'Implement {0} pagination',
  'Add {0} error handling',
  'Refactor {0} service',
  'Update {0} schema',
  'Fix {0} race condition',
  'Implement {0} retry logic',
  'Add {0} rate limiting',
  'Fix {0} encoding issue',
  'Implement {0} search',
  'Add {0} monitoring',
  'Fix {0} null pointer',
  'Implement {0} webhook',
  'Add {0} documentation',
  'Fix {0} CSS layout',
  'Implement {0} export',
  'Add {0} analytics',
  'Fix {0} auth flow',
  'Implement {0} notification',
  'Add {0} batch processing',
  'Fix {0} data sync',
  'Implement {0} migration',
  'Add {0} health check',
  'Fix {0} date parsing',
  'Implement {0} queue',
  'Add {0} compression',
  'Fix {0} i18n issue',
  'Implement {0} SSO',
  'Add {0} audit trail',
  'Fix {0} permission check',
  'Implement {0} dashboard',
  'Add {0} backup strategy',
  'Fix {0} deadlock',
  'Implement {0} template',
  'Add {0} circuit breaker',
  'Fix {0} memory usage',
  'Implement {0} filter',
  'Add {0} input sanitization',
  'Fix {0} connection pool',
  'Implement {0} archival',
  'Add {0} feature flag',
  'Fix {0} scroll behavior',
  'Implement {0} drag-drop',
  'Add {0} keyboard shortcuts',
  'Fix {0} timezone handling',
  'Implement {0} versioning',
  'Add {0} undo support',
  'Fix {0} image upload',
];

const FEATURE_NOUNS = [
  'user',
  'payment',
  'invoice',
  'dashboard',
  'notification',
  'report',
  'settings',
  'profile',
  'search',
  'calendar',
  'chat',
  'file',
  'permission',
  'workflow',
  'integration',
  'analytics',
  'billing',
  'subscription',
  'onboarding',
  'feedback',
];

function titleAndDesc(i: number): { title: string; description: string } {
  const noun = FEATURE_NOUNS[i % FEATURE_NOUNS.length]!;
  const template = TITLE_TEMPLATES[i % TITLE_TEMPLATES.length]!;
  const title = template.replace('{0}', noun);
  const description = `${title}. This involves updating the ${noun} subsystem to improve reliability and performance.`;
  return { title, description };
}

function pickPriority(i: number): GoldenTask['priority'] {
  const r = i % 20;
  if (r <= 1) return 'urgent'; // 10%
  if (r <= 6) return 'important'; // 25%
  if (r <= 15) return 'medium'; // 45%
  return 'low'; // 20%
}

function pickProgress(i: number): GoldenTask['progress'] {
  const r = i % 20;
  if (r <= 6) return 'done'; // 35%
  if (r <= 11) return 'in_progress'; // 25%
  return 'not_started'; // 40%
}

function pickDue(i: number): Date | null {
  if (i % 5 >= 3) return null; // ~40% null
  const offset = ((i * 13) % 61) - 30; // -30..30
  return C.daysFromNow(offset);
}

function pickAssignees(i: number, pool: string[]): string[] {
  const r = i % 20;
  const base = i % pool.length;
  if (r === 0) return []; // 5%
  if (r === 1 || r === 2) {
    // 10% — two assignees
    const second = (base + 1) % pool.length;
    return second === base ? [pool[base]!] : [pool[base]!, pool[second]!];
  }
  return [pool[base]!]; // 85%
}

function pickLabels(i: number, labelPool: GoldenLabel[]): string[] {
  if (labelPool.length === 0) return [];
  if (i % 5 >= 2) return []; // ~40% get labels
  const count = Math.min(labelPool.length, i % 2 === 0 ? 1 : 2);
  const base = i % labelPool.length;
  const ids: string[] = [];
  for (let k = 0; k < count; k++) {
    ids.push(labelPool[(base + k) % labelPool.length]!.id);
  }
  return ids;
}

function bucketForProgress(
  buckets: GoldenBucket[],
  progress: GoldenTask['progress'],
  idx: number,
): GoldenBucket {
  if (progress === 'done') return buckets[buckets.length - 1]!;
  if (progress === 'not_started') return buckets[0]!;
  const mid = buckets.slice(1, buckets.length - 1);
  return mid.length > 0 ? mid[idx % mid.length]! : buckets[Math.min(1, buckets.length - 1)]!;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function makeFillerTask(opts: {
  idx: number;
  planId: string;
  buckets: GoldenBucket[];
  pool: string[];
  labelPool: GoldenLabel[];
}): GoldenTask {
  const { idx, planId, buckets, pool, labelPool } = opts;
  const { title, description } = titleAndDesc(idx);
  const priority = pickPriority(idx);
  const progress = pickProgress(idx);
  const bucket = bucketForProgress(buckets, progress, idx);
  return {
    id: C.seededId('task0000', idx),
    plan_id: planId,
    bucket_id: bucket.id,
    title,
    description,
    priority,
    progress,
    due_at: pickDue(idx),
    created_at: C.daysFromNow(-(10 + (idx % 60))),
    assignee_user_ids: pickAssignees(idx, pool),
    label_ids: pickLabels(idx, labelPool),
  };
}

function generateBackgroundTasks(): GoldenTask[] {
  const tasks: GoldenTask[] = [];
  let idx = 100;
  const next = () => idx++;

  const ALPHA_LABELS = LABELS.filter((l) => l.plan_id === C.PLAN_ALPHA_ID);
  const SPRINT12_LABELS = LABELS.filter((l) => l.plan_id === C.PLAN_SPRINT12_ID);
  const APIMIG_LABELS = LABELS.filter((l) => l.plan_id === C.PLAN_API_MIG_ID);
  const BILLING_LABELS = LABELS.filter((l) => l.plan_id === C.PLAN_BILLING_ID);

  const APIMIG_BUCKETS = BUCKETS.filter((b) => b.plan_id === C.PLAN_API_MIG_ID);
  const BETA_BUCKETS = BUCKETS.filter((b) => b.plan_id === C.PLAN_BETA_ID);
  const BILLING_BUCKETS = BUCKETS.filter((b) => b.plan_id === C.PLAN_BILLING_ID);
  const INFRA_BUCKETS = BUCKETS.filter((b) => b.plan_id === C.PLAN_INFRA_ID);
  const SECURITY_BUCKETS = BUCKETS.filter((b) => b.plan_id === C.PLAN_SECURITY_ID);
  const Q3_BUCKETS = BUCKETS.filter((b) => b.plan_id === C.PLAN_Q3_ID);

  const ENG_POOL = [
    C.USER_LINH_ID,
    C.USER_DUC_ID,
    C.USER_THANH_ID,
    C.USER_NAM_ID,
    C.USER_HOA_ID,
    ...GENERATED_PEOPLE.slice(0, 8).map((p) => p.user_id),
  ];
  const PLAT_POOL = [
    C.USER_MINH_ID,
    C.USER_LAN_ID,
    C.USER_HOA_ID,
    ...GENERATED_PEOPLE.slice(8, 15).map((p) => p.user_id),
  ];
  const DEVOPS_POOL = [
    C.USER_CHI_ID,
    C.USER_KHOA_ID,
    ...GENERATED_PEOPLE.slice(15, 20).map((p) => p.user_id),
  ];

  // -------------------------------------------------------------------------
  // Project Alpha — 34 generated tasks (40 total w/ 6 key tasks).
  // 27 done (9 due within the current week), 3 overdue, 4 remaining
  // (2 open assigned to Tuan, 2 open assigned to others).
  // -------------------------------------------------------------------------
  for (let j = 0; j < 27; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    const dueThisWeek = j < 9;
    const due = dueThisWeek
      ? addDays(C.startOfWeek(), j % 7)
      : j % 3 === 0
        ? null
        : C.daysFromNow(j % 2 === 0 ? -(20 + j) : 20 + j);
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_ALPHA_ID,
      bucket_id: BUCKET_ALPHA_DONE.id,
      title,
      description,
      priority: pickPriority(i),
      progress: 'done',
      due_at: due,
      created_at: C.daysFromNow(-(15 + (j % 40))),
      assignee_user_ids: [ENG_POOL[j % ENG_POOL.length]!],
      label_ids: j % 5 === 0 ? [ALPHA_LABELS[j % ALPHA_LABELS.length]!.id] : [],
    });
  }
  // The key task "Review PR #42" is due `daysFromNow(0)` (today 09:00). Once
  // seeded after 09:00 local time it reads as past-due and — since it is
  // non-done — counts toward Alpha's overdue total on its own. Size the
  // generated overdue bucket around that so the Alpha overdue count is
  // always exactly 3 regardless of what time of day the fixture is seeded.
  const reviewPrIsOverdue = C.daysFromNow(0).getTime() < Date.now();
  const alphaOverdueCount = reviewPrIsOverdue ? 2 : 3;
  const alphaRemainingCount = 34 - 27 - alphaOverdueCount;

  for (let j = 0; j < alphaOverdueCount; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    const progress: GoldenTask['progress'] = j % 2 === 0 ? 'in_progress' : 'not_started';
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_ALPHA_ID,
      bucket_id: progress === 'in_progress' ? BUCKET_ALPHA_IN_PROGRESS.id : BUCKET_ALPHA_BACKLOG.id,
      title,
      description,
      priority: j === 0 ? 'important' : 'medium',
      progress,
      due_at: C.daysFromNow(-(14 + j * 6)), // -14, -20, -26: safely past, outside current week
      created_at: C.daysFromNow(-(30 + j)),
      assignee_user_ids: [ENG_POOL[(j + 3) % ENG_POOL.length]!],
      label_ids: [],
    });
  }
  for (let j = 0; j < alphaRemainingCount; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    const isTuan = j < 2;
    const progress: GoldenTask['progress'] = j % 2 === 0 ? 'not_started' : 'in_progress';
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_ALPHA_ID,
      bucket_id: progress === 'in_progress' ? BUCKET_ALPHA_IN_PROGRESS.id : BUCKET_ALPHA_BACKLOG.id,
      title,
      description,
      priority: 'medium',
      progress,
      due_at: j % 2 === 0 ? null : C.daysFromNow(15 + j),
      created_at: C.daysFromNow(-(10 + j)),
      assignee_user_ids: [isTuan ? C.USER_TUAN_ID : ENG_POOL[j % ENG_POOL.length]!],
      label_ids: [],
    });
  }

  // -------------------------------------------------------------------------
  // Sprint 12 — 25 tasks, bucket-distributed 8/5/4/8. One Tuan-open task in
  // each of Todo/InProgress/Review (3 total), none in Done.
  // -------------------------------------------------------------------------
  for (let j = 0; j < 8; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_SPRINT12_ID,
      bucket_id: BUCKET_SPRINT12_TODO.id,
      title,
      description,
      priority: pickPriority(i),
      progress: 'not_started',
      due_at: pickDue(i),
      created_at: C.daysFromNow(-(5 + j)),
      assignee_user_ids: j === 0 ? [C.USER_TUAN_ID] : [ENG_POOL[j % ENG_POOL.length]!],
      label_ids: pickLabels(i, SPRINT12_LABELS),
    });
  }
  for (let j = 0; j < 5; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_SPRINT12_ID,
      bucket_id: BUCKET_SPRINT12_IN_PROGRESS.id,
      title,
      description,
      priority: pickPriority(i),
      progress: 'in_progress',
      due_at: pickDue(i),
      created_at: C.daysFromNow(-(5 + j)),
      assignee_user_ids: j === 0 ? [C.USER_TUAN_ID] : [ENG_POOL[j % ENG_POOL.length]!],
      label_ids: pickLabels(i, SPRINT12_LABELS),
    });
  }
  for (let j = 0; j < 4; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_SPRINT12_ID,
      bucket_id: BUCKET_SPRINT12_REVIEW.id,
      title,
      description,
      priority: pickPriority(i),
      progress: 'in_progress',
      due_at: pickDue(i),
      created_at: C.daysFromNow(-(5 + j)),
      assignee_user_ids: j === 0 ? [C.USER_TUAN_ID] : [ENG_POOL[j % ENG_POOL.length]!],
      label_ids: pickLabels(i, SPRINT12_LABELS),
    });
  }
  for (let j = 0; j < 8; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_SPRINT12_ID,
      bucket_id: BUCKET_SPRINT12_DONE.id,
      title,
      description,
      priority: pickPriority(i),
      progress: 'done',
      due_at: pickDue(i),
      created_at: C.daysFromNow(-(10 + j)),
      assignee_user_ids: [ENG_POOL[j % ENG_POOL.length]!],
      label_ids: pickLabels(i, SPRINT12_LABELS),
    });
  }

  // -------------------------------------------------------------------------
  // API Migration — 21 generated tasks (25 total w/ 4 key). 2 open, assigned
  // to Tuan; 19 filler.
  // -------------------------------------------------------------------------
  for (let j = 0; j < 2; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    const progress: GoldenTask['progress'] = j === 0 ? 'in_progress' : 'not_started';
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_API_MIG_ID,
      bucket_id: progress === 'in_progress' ? BUCKET_API_MIG_ACTIVE.id : BUCKET_API_MIG_PLANNING.id,
      title,
      description,
      priority: 'important',
      progress,
      due_at: j === 0 ? C.daysFromNow(9) : null,
      created_at: C.daysFromNow(-(8 + j)),
      assignee_user_ids: [C.USER_TUAN_ID],
      label_ids: [],
    });
  }
  for (let j = 0; j < 19; j++) {
    const i = next();
    tasks.push(
      makeFillerTask({
        idx: i,
        planId: C.PLAN_API_MIG_ID,
        buckets: APIMIG_BUCKETS,
        pool: ENG_POOL,
        labelPool: APIMIG_LABELS,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Project Beta — 30 tasks. 12 assigned to the Actor (6 open + 6 done);
  // 18 filler.
  // -------------------------------------------------------------------------
  for (let j = 0; j < 6; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    const progress: GoldenTask['progress'] = j % 2 === 0 ? 'not_started' : 'in_progress';
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_BETA_ID,
      bucket_id: bucketForProgress(BETA_BUCKETS, progress, j).id,
      title,
      description,
      priority: pickPriority(i),
      progress,
      due_at: pickDue(i),
      created_at: C.daysFromNow(-(5 + j)),
      assignee_user_ids: [C.ACTOR_USER_ID],
      label_ids: [],
    });
  }
  for (let j = 0; j < 6; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_BETA_ID,
      bucket_id: BETA_BUCKETS[BETA_BUCKETS.length - 1]!.id,
      title,
      description,
      priority: pickPriority(i),
      progress: 'done',
      due_at: pickDue(i),
      created_at: C.daysFromNow(-(20 + j)),
      assignee_user_ids: [C.ACTOR_USER_ID],
      label_ids: [],
    });
  }
  for (let j = 0; j < 18; j++) {
    const i = next();
    tasks.push(
      makeFillerTask({
        idx: i,
        planId: C.PLAN_BETA_ID,
        buckets: BETA_BUCKETS,
        pool: PLAT_POOL,
        labelPool: [],
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Billing Overhaul — 19 filler tasks (20 total w/ 1 key).
  // -------------------------------------------------------------------------
  for (let j = 0; j < 19; j++) {
    const i = next();
    tasks.push(
      makeFillerTask({
        idx: i,
        planId: C.PLAN_BILLING_ID,
        buckets: BILLING_BUCKETS,
        pool: PLAT_POOL,
        labelPool: BILLING_LABELS,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Infrastructure — 20 filler tasks.
  // -------------------------------------------------------------------------
  for (let j = 0; j < 20; j++) {
    const i = next();
    tasks.push(
      makeFillerTask({
        idx: i,
        planId: C.PLAN_INFRA_ID,
        buckets: INFRA_BUCKETS,
        pool: DEVOPS_POOL,
        labelPool: [],
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Security Audit — 15 filler tasks.
  // -------------------------------------------------------------------------
  for (let j = 0; j < 15; j++) {
    const i = next();
    tasks.push(
      makeFillerTask({
        idx: i,
        planId: C.PLAN_SECURITY_ID,
        buckets: SECURITY_BUCKETS,
        pool: DEVOPS_POOL,
        labelPool: [],
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Q3 Roadmap — 25 tasks. 2 open, assigned to Tuan; 23 filler.
  // -------------------------------------------------------------------------
  for (let j = 0; j < 2; j++) {
    const i = next();
    const { title, description } = titleAndDesc(i);
    const progress: GoldenTask['progress'] = j === 0 ? 'not_started' : 'in_progress';
    tasks.push({
      id: C.seededId('task0000', i),
      plan_id: C.PLAN_Q3_ID,
      bucket_id: bucketForProgress(Q3_BUCKETS, progress, j).id,
      title,
      description,
      priority: 'medium',
      progress,
      due_at: j === 0 ? null : C.daysFromNow(25),
      created_at: C.daysFromNow(-(6 + j)),
      assignee_user_ids: [C.USER_TUAN_ID],
      label_ids: [],
    });
  }
  for (let j = 0; j < 23; j++) {
    const i = next();
    tasks.push(
      makeFillerTask({
        idx: i,
        planId: C.PLAN_Q3_ID,
        buckets: Q3_BUCKETS,
        pool: ENG_POOL,
        labelPool: [],
      }),
    );
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Step 3 — Comments
// ---------------------------------------------------------------------------

const KEY_COMMENTS: GoldenComment[] = [
  {
    id: C.seededId('comment0', 1),
    task_id: C.TASK_BILLING_SCHEMA_ID,
    author_user_id: C.USER_LINH_ID,
    body: 'Schema draft ready for review. The new tables support multi-currency with ISO 4217 codes. I added a currency_conversion_rate column to handle real-time rate lookups.',
    created_at: C.daysFromNow(-5),
  },
  {
    id: C.seededId('comment0', 2),
    task_id: C.TASK_BILLING_SCHEMA_ID,
    author_user_id: C.USER_HOA_ID,
    body: 'Reviewed. Concerns about FK cascade on invoice_items — if we delete a currency record, it would cascade-delete all associated invoices. Suggest using SET NULL or restrict instead.',
    created_at: C.daysFromNow(-4),
  },
  {
    id: C.seededId('comment0', 3),
    task_id: C.TASK_BILLING_SCHEMA_ID,
    author_user_id: C.ACTOR_USER_ID,
    body: "Let's align on the rollback strategy before merging. If the multi-currency migration fails halfway, we need a clear path back to single-currency without data loss.",
    created_at: C.daysFromNow(-3),
  },
  {
    id: C.seededId('comment0', 4),
    task_id: C.TASK_API_RATE_LIMIT_ID,
    author_user_id: C.USER_TUAN_ID,
    body: 'Initial implementation using token bucket algorithm. Per-endpoint approach gives us more flexibility — we can set /search to 100 req/min and /auth to 20 req/min independently.',
    created_at: C.daysFromNow(-3),
  },
  {
    id: C.seededId('comment0', 5),
    task_id: C.TASK_API_RATE_LIMIT_ID,
    author_user_id: C.USER_NAM_ID,
    body: '+1 for per-endpoint. Our /search endpoint gets 10x more traffic than others. A global limit would either throttle search too aggressively or leave other endpoints unprotected.',
    created_at: C.daysFromNow(-2),
  },
];

const COMMENT_TEMPLATES = [
  'LGTM overall, left a couple of inline notes on the diff.',
  'Can we add a test for the edge case where the input is empty?',
  'This looks like it might regress the caching layer, can you double check?',
  'Nice catch on the race condition, much cleaner now.',
  'Should we log this at warn level instead of error?',
  'The naming here is a bit confusing, maybe rename to something clearer?',
  'Ran this locally and it works as expected, approving.',
  'Suggest splitting this into a follow-up PR to keep the diff reviewable.',
  'Flagging a potential N+1 query here, worth checking with an EXPLAIN.',
  'Good point from standup, updating the approach to match.',
  'This needs a migration guard for existing rows before it can ship.',
  'Agreed, going with the simpler implementation for now.',
  'Double checked against the staging logs, no anomalies so far.',
  'Small nit: prefer an early return here over the nested if.',
  'Blocked on the upstream API change, will revisit once that lands.',
];

function generateComments(allTasks: GoldenTask[]): GoldenComment[] {
  const candidates = allTasks.filter(
    (t) => t.assignee_user_ids.length > 0 && t.id !== C.TASK_BILLING_SCHEMA_ID,
  );
  const comments: GoldenComment[] = [];
  const count = 55;
  for (let g = 0; g < count; g++) {
    const i = g + 6;
    const task = candidates[g % candidates.length]!;
    const author = task.assignee_user_ids[g % task.assignee_user_ids.length]!;
    const body = COMMENT_TEMPLATES[g % COMMENT_TEMPLATES.length]!;
    comments.push({
      id: C.seededId('comment0', i),
      task_id: task.id,
      author_user_id: author,
      body,
      created_at: C.daysFromNow(-((g % 20) + 1)),
    });
  }
  return comments;
}

// ---------------------------------------------------------------------------
// Step 4 — Exports
// ---------------------------------------------------------------------------

export const ALL_TASKS: GoldenTask[] = [...KEY_TASKS, ...generateBackgroundTasks()];
export const ALL_COMMENTS: GoldenComment[] = [...KEY_COMMENTS, ...generateComments(ALL_TASKS)];
