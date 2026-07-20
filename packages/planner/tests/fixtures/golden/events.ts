// packages/planner/tests/fixtures/golden/events.ts
import * as C from './constants.ts';
import { daysFromNow, seededId } from './constants.ts';
import { ALL_PEOPLE } from './people.ts';
import { LABELS } from './plans.ts';
import { ALL_COMMENTS, ALL_TASKS, type GoldenTask } from './tasks.ts';

export interface GoldenEvent {
  id: string;
  occurred_at: Date;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  caused_by_user_id: string | null;
}

// ---------------------------------------------------------------------------
// user_id -> full_name lookup, used to populate payload.actor.display_name.
// ---------------------------------------------------------------------------

const NAME_BY_USER_ID: Map<string, string> = new Map(
  ALL_PEOPLE.map((p) => [p.user_id, p.full_name]),
);

function displayNameFor(userId: string): string {
  return NAME_BY_USER_ID.get(userId) ?? userId;
}

function actorFor(userId: string): { user_id: string; display_name: string } {
  return { user_id: userId, display_name: displayNameFor(userId) };
}

const ALPHA_CRITICAL_LABEL_ID = LABELS.find(
  (l) => l.plan_id === C.PLAN_ALPHA_ID && l.name === 'critical',
)!.id;

// ---------------------------------------------------------------------------
// Section 1 — PQ-010: API Rate Limit Fix key event sequence (exactly 6).
// ---------------------------------------------------------------------------

const RATE_LIMIT_COMMENT_TUAN = ALL_COMMENTS.find(
  (c) => c.task_id === C.TASK_API_RATE_LIMIT_ID && c.author_user_id === C.USER_TUAN_ID,
)!;
const RATE_LIMIT_COMMENT_NAM = ALL_COMMENTS.find(
  (c) => c.task_id === C.TASK_API_RATE_LIMIT_ID && c.author_user_id === C.USER_NAM_ID,
)!;

export const API_RATE_LIMIT_EVENTS: GoldenEvent[] = [
  {
    id: seededId('event000', 1),
    occurred_at: daysFromNow(-10),
    aggregate_type: 'planner.task',
    aggregate_id: C.TASK_API_RATE_LIMIT_ID,
    event_type: 'planner.task.created',
    event_version: 1,
    payload: {
      after: { title: 'API Rate Limit Fix', progress: 'not_started' },
      actor: actorFor(C.ACTOR_USER_ID),
    },
    caused_by_user_id: C.ACTOR_USER_ID,
  },
  {
    id: seededId('event000', 2),
    occurred_at: daysFromNow(-10),
    aggregate_type: 'planner.task',
    aggregate_id: C.TASK_API_RATE_LIMIT_ID,
    event_type: 'planner.task.assigned',
    event_version: 1,
    payload: {
      user_id: C.USER_TUAN_ID,
      actor: actorFor(C.ACTOR_USER_ID),
    },
    caused_by_user_id: C.ACTOR_USER_ID,
  },
  {
    id: seededId('event000', 3),
    occurred_at: daysFromNow(-5),
    aggregate_type: 'planner.task',
    aggregate_id: C.TASK_API_RATE_LIMIT_ID,
    event_type: 'planner.task.updated',
    event_version: 1,
    payload: {
      changed_fields: ['progress'],
      before: { progress: 'not_started' },
      after: { progress: 'in_progress' },
      actor: actorFor(C.USER_TUAN_ID),
    },
    caused_by_user_id: C.USER_TUAN_ID,
  },
  {
    id: seededId('event000', 4),
    occurred_at: daysFromNow(-3),
    aggregate_type: 'planner.comment',
    aggregate_id: RATE_LIMIT_COMMENT_TUAN.id,
    event_type: 'planner.comment.created',
    event_version: 1,
    payload: {
      task_id: C.TASK_API_RATE_LIMIT_ID,
      body: RATE_LIMIT_COMMENT_TUAN.body,
      author_id: C.USER_TUAN_ID,
      actor: actorFor(C.USER_TUAN_ID),
    },
    caused_by_user_id: C.USER_TUAN_ID,
  },
  {
    id: seededId('event000', 5),
    occurred_at: daysFromNow(-2),
    aggregate_type: 'planner.comment',
    aggregate_id: RATE_LIMIT_COMMENT_NAM.id,
    event_type: 'planner.comment.created',
    event_version: 1,
    payload: {
      task_id: C.TASK_API_RATE_LIMIT_ID,
      body: RATE_LIMIT_COMMENT_NAM.body,
      author_id: C.USER_NAM_ID,
      actor: actorFor(C.USER_NAM_ID),
    },
    caused_by_user_id: C.USER_NAM_ID,
  },
  {
    id: seededId('event000', 6),
    occurred_at: daysFromNow(-1),
    aggregate_type: 'planner.label',
    aggregate_id: C.TASK_API_RATE_LIMIT_ID,
    event_type: 'planner.label.applied',
    event_version: 1,
    payload: {
      task_id: C.TASK_API_RATE_LIMIT_ID,
      label_id: ALPHA_CRITICAL_LABEL_ID,
      actor: actorFor(C.ACTOR_USER_ID),
    },
    caused_by_user_id: C.ACTOR_USER_ID,
  },
];

const RATE_LIMIT_COMMENT_IDS_USED = new Set([
  RATE_LIMIT_COMMENT_TUAN.id,
  RATE_LIMIT_COMMENT_NAM.id,
]);

// ---------------------------------------------------------------------------
// Section 2 — PQ-017: Tuan's weekly activity (7-10 events, all within the
// last 7 days, all caused_by_user_id === USER_TUAN_ID).
// ---------------------------------------------------------------------------

// Excludes TASK_API_RATE_LIMIT_ID — its event history is already fully
// specified by the PQ-010 sequence above; reusing it here would inflate
// that sequence's matched-event count beyond the expected 6.
const TUAN_TASKS = ALL_TASKS.filter(
  (t) => t.assignee_user_ids.includes(C.USER_TUAN_ID) && t.id !== C.TASK_API_RATE_LIMIT_ID,
);

function taskAt(index: number): GoldenTask {
  return TUAN_TASKS[index % TUAN_TASKS.length]!;
}

let tuanEventCounter = 7;
function nextTuanEventId(): string {
  return seededId('event000', tuanEventCounter++);
}

export const TUAN_WEEKLY_EVENTS: GoldenEvent[] = [];

// 2x planner.task.completed
for (let k = 0; k < 2; k++) {
  const task = taskAt(k);
  const occurredAt = daysFromNow(-(1 + k));
  TUAN_WEEKLY_EVENTS.push({
    id: nextTuanEventId(),
    occurred_at: occurredAt,
    aggregate_type: 'planner.task',
    aggregate_id: task.id,
    event_type: 'planner.task.completed',
    event_version: 1,
    payload: {
      completed_at: occurredAt.toISOString(),
      actor: actorFor(C.USER_TUAN_ID),
    },
    caused_by_user_id: C.USER_TUAN_ID,
  });
}

// 3x planner.task.updated
const UPDATE_VARIANTS: Array<{
  changed_fields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}> = [
  {
    changed_fields: ['priority'],
    before: { priority: 'medium' },
    after: { priority: 'urgent' },
  },
  {
    changed_fields: ['progress'],
    before: { progress: 'not_started' },
    after: { progress: 'in_progress' },
  },
  {
    changed_fields: ['priority'],
    before: { priority: 'important' },
    after: { priority: 'medium' },
  },
];
for (let k = 0; k < 3; k++) {
  const task = taskAt(k + 2);
  const variant = UPDATE_VARIANTS[k]!;
  TUAN_WEEKLY_EVENTS.push({
    id: nextTuanEventId(),
    occurred_at: daysFromNow(-(2 + k)),
    aggregate_type: 'planner.task',
    aggregate_id: task.id,
    event_type: 'planner.task.updated',
    event_version: 1,
    payload: {
      changed_fields: variant.changed_fields,
      before: variant.before,
      after: variant.after,
      actor: actorFor(C.USER_TUAN_ID),
    },
    caused_by_user_id: C.USER_TUAN_ID,
  });
}

// 2x planner.comment.created — Tuan-authored comments not already used in
// the PQ-010 sequence.
const TUAN_OTHER_COMMENTS = ALL_COMMENTS.filter(
  (c) =>
    c.author_user_id === C.USER_TUAN_ID &&
    !RATE_LIMIT_COMMENT_IDS_USED.has(c.id) &&
    c.task_id !== C.TASK_API_RATE_LIMIT_ID,
).slice(0, 2);
for (const comment of TUAN_OTHER_COMMENTS) {
  TUAN_WEEKLY_EVENTS.push({
    id: nextTuanEventId(),
    occurred_at: daysFromNow(-3),
    aggregate_type: 'planner.comment',
    aggregate_id: comment.id,
    event_type: 'planner.comment.created',
    event_version: 1,
    payload: {
      task_id: comment.task_id,
      body: comment.body,
      author_id: C.USER_TUAN_ID,
      actor: actorFor(C.USER_TUAN_ID),
    },
    caused_by_user_id: C.USER_TUAN_ID,
  });
}

// 1x planner.task.assigned — Tuan self-assigning.
{
  const task = taskAt(5);
  TUAN_WEEKLY_EVENTS.push({
    id: nextTuanEventId(),
    occurred_at: daysFromNow(-1),
    aggregate_type: 'planner.task',
    aggregate_id: task.id,
    event_type: 'planner.task.assigned',
    event_version: 1,
    payload: {
      user_id: C.USER_TUAN_ID,
      actor: actorFor(C.USER_TUAN_ID),
    },
    caused_by_user_id: C.USER_TUAN_ID,
  });
}

// ---------------------------------------------------------------------------
// Section 3 — Bulk events.
// ---------------------------------------------------------------------------

const TUAN_WEEKLY_COMMENT_IDS_USED = new Set(TUAN_OTHER_COMMENTS.map((c) => c.id));

function midpoint(a: Date, b: Date): Date {
  return new Date((a.getTime() + b.getTime()) / 2);
}

function clampPastNotFuture(d: Date, created: Date): Date {
  const now = new Date();
  if (d.getTime() >= now.getTime()) return midpoint(created, now);
  if (d.getTime() <= created.getTime()) return midpoint(created, now);
  return d;
}

export function generateBulkEvents(): GoldenEvent[] {
  const events: GoldenEvent[] = [];
  let idx = 100;
  const next = () => seededId('event000', idx++);

  // (2) task -> assignee pairs already covered by earlier sections, to skip.
  const skippedAssignPairs = new Set<string>([
    `${C.TASK_API_RATE_LIMIT_ID}:${C.USER_TUAN_ID}`,
    `${taskAt(5).id}:${C.USER_TUAN_ID}`,
  ]);

  // 1. planner.task.created — 1 per task, except TASK_API_RATE_LIMIT_ID.
  for (const task of ALL_TASKS) {
    if (task.id === C.TASK_API_RATE_LIMIT_ID) continue;
    const actorUserId = task.assignee_user_ids[0] ?? C.ACTOR_USER_ID;
    events.push({
      id: next(),
      occurred_at: task.created_at,
      aggregate_type: 'planner.task',
      aggregate_id: task.id,
      event_type: 'planner.task.created',
      event_version: 1,
      payload: {
        after: { title: task.title, progress: 'not_started' },
        actor: actorFor(actorUserId),
      },
      caused_by_user_id: actorUserId,
    });
  }

  // 2. planner.task.assigned — 1 per (task, assignee) pair, excluding the
  // pairings already covered by the PQ-010 and PQ-017 sequences.
  for (const task of ALL_TASKS) {
    if (task.assignee_user_ids.length === 0) continue;
    for (const assigneeUserId of task.assignee_user_ids) {
      const key = `${task.id}:${assigneeUserId}`;
      if (skippedAssignPairs.has(key)) continue;
      const otherAssignee = task.assignee_user_ids.find((u) => u !== assigneeUserId);
      const actorUserId = otherAssignee ?? C.ACTOR_USER_ID;
      events.push({
        id: next(),
        occurred_at: task.created_at,
        aggregate_type: 'planner.task',
        aggregate_id: task.id,
        event_type: 'planner.task.assigned',
        event_version: 1,
        payload: {
          user_id: assigneeUserId,
          actor: actorFor(actorUserId),
        },
        caused_by_user_id: actorUserId,
      });
    }
  }

  // (3) tasks already covered by the PQ-017 "completed" events, to skip.
  const completedSkipSet = new Set<string>(
    TUAN_WEEKLY_EVENTS.filter((e) => e.event_type === 'planner.task.completed').map(
      (e) => e.aggregate_id,
    ),
  );

  // 3. planner.task.completed — 1 per done task, excluding PQ-017 coverage.
  for (const task of ALL_TASKS) {
    if (task.progress !== 'done') continue;
    if (completedSkipSet.has(task.id)) continue;
    const now = new Date();
    const dueInPastAndAfterCreated =
      task.due_at !== null &&
      task.due_at.getTime() < now.getTime() &&
      task.due_at.getTime() > task.created_at.getTime();
    const occurredAt = clampPastNotFuture(
      dueInPastAndAfterCreated ? task.due_at! : midpoint(task.created_at, now),
      task.created_at,
    );
    const actorUserId = task.assignee_user_ids[0] ?? C.ACTOR_USER_ID;
    events.push({
      id: next(),
      occurred_at: occurredAt,
      aggregate_type: 'planner.task',
      aggregate_id: task.id,
      event_type: 'planner.task.completed',
      event_version: 1,
      payload: {
        completed_at: occurredAt.toISOString(),
        actor: actorFor(actorUserId),
      },
      caused_by_user_id: actorUserId,
    });
  }

  // 4. planner.task.updated — ~80 events, deterministic selection (every
  // 2nd task by array index).
  const PRIORITY_ROTATION: Record<GoldenTask['priority'], GoldenTask['priority']> = {
    urgent: 'important',
    important: 'medium',
    medium: 'low',
    low: 'medium',
  };
  const PROGRESS_PREDECESSOR: Record<GoldenTask['progress'], GoldenTask['progress'] | null> = {
    not_started: null,
    in_progress: 'not_started',
    done: 'in_progress',
  };
  let updatedCount = 0;
  for (let i = 0; i < ALL_TASKS.length && updatedCount < 80; i += 2) {
    const task = ALL_TASKS[i]!;
    if (task.id === C.TASK_API_RATE_LIMIT_ID) continue;
    const now = new Date();
    const occurredAt = clampPastNotFuture(midpoint(task.created_at, now), task.created_at);
    const actorUserId = task.assignee_user_ids[0] ?? C.ACTOR_USER_ID;
    const priorPregress = PROGRESS_PREDECESSOR[task.progress];
    const useProgress = i % 4 === 0 && priorPregress !== null;
    const payload = useProgress
      ? {
          changed_fields: ['progress'],
          before: { progress: priorPregress },
          after: { progress: task.progress },
          actor: actorFor(actorUserId),
        }
      : {
          changed_fields: ['priority'],
          before: { priority: PRIORITY_ROTATION[task.priority] },
          after: { priority: task.priority },
          actor: actorFor(actorUserId),
        };
    events.push({
      id: next(),
      occurred_at: occurredAt,
      aggregate_type: 'planner.task',
      aggregate_id: task.id,
      event_type: 'planner.task.updated',
      event_version: 1,
      payload,
      caused_by_user_id: actorUserId,
    });
    updatedCount++;
  }

  // 5. planner.comment.created — 1 per comment, excluding PQ-010 + PQ-017
  // coverage. Also excludes any *other* comment on TASK_API_RATE_LIMIT_ID
  // (there is a 3rd, bulk-generated comment on that task beyond the 2 named
  // in the PQ-010 sequence) so that task's activity feed stays fixed at
  // exactly the 6 events the PQ-010 sequence specifies.
  for (const comment of ALL_COMMENTS) {
    if (RATE_LIMIT_COMMENT_IDS_USED.has(comment.id)) continue;
    if (TUAN_WEEKLY_COMMENT_IDS_USED.has(comment.id)) continue;
    if (comment.task_id === C.TASK_API_RATE_LIMIT_ID) continue;
    events.push({
      id: next(),
      occurred_at: comment.created_at,
      aggregate_type: 'planner.comment',
      aggregate_id: comment.id,
      event_type: 'planner.comment.created',
      event_version: 1,
      payload: {
        task_id: comment.task_id,
        body: comment.body,
        author_id: comment.author_user_id,
        actor: actorFor(comment.author_user_id),
      },
      caused_by_user_id: comment.author_user_id,
    });
  }

  // 6. planner.label.applied — 1 per (task, label) pair, excluding the
  // PQ-010 pairing.
  for (const task of ALL_TASKS) {
    if (task.label_ids.length === 0) continue;
    for (const labelId of task.label_ids) {
      if (task.id === C.TASK_API_RATE_LIMIT_ID && labelId === ALPHA_CRITICAL_LABEL_ID) continue;
      const now = new Date();
      const occurredAt = clampPastNotFuture(midpoint(task.created_at, now), task.created_at);
      const actorUserId = task.assignee_user_ids[0] ?? C.ACTOR_USER_ID;
      events.push({
        id: next(),
        occurred_at: occurredAt,
        aggregate_type: 'planner.label',
        aggregate_id: task.id,
        event_type: 'planner.label.applied',
        event_version: 1,
        payload: {
          task_id: task.id,
          label_id: labelId,
          actor: actorFor(actorUserId),
        },
        caused_by_user_id: actorUserId,
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ALL_EVENTS: GoldenEvent[] = [
  ...API_RATE_LIMIT_EVENTS,
  ...TUAN_WEEKLY_EVENTS,
  ...generateBulkEvents(),
];
