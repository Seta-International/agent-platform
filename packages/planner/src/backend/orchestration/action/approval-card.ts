import type { ApprovalCard } from '@seta/agent-sdk';
import { PLATFORM_TIMEZONE } from '@seta/agent-sdk';
import { ACTION_WORKFLOW_ID } from './orchestrator-spec.ts';
import type { ActionTaskSnapshot, ToolTaskLinkKind, UpdateTaskActionPatch } from './schemas.ts';

/** Field order on the card. Stable, so a diff reads the same way every time. */
const FIELD_ORDER = [
  'title',
  'description',
  'start_at',
  'due_at',
  'priority_number',
  'percent_complete',
] as const satisfies readonly (keyof UpdateTaskActionPatch)[];

const FIELD_LABELS: Record<(typeof FIELD_ORDER)[number], string> = {
  title: 'Title',
  description: 'Description',
  start_at: 'Start',
  due_at: 'Due',
  priority_number: 'Priority',
  percent_complete: 'Progress',
};

// The data model stores priority as 1/3/5/9 and status as 0/50/100. Those
// numbers mean nothing to a reader, so the card never shows them.
const PRIORITY_LABELS: Record<number, string> = {
  1: 'Urgent',
  3: 'Important',
  5: 'Medium',
  9: 'Low',
};
const PROGRESS_LABELS: Record<number, string> = {
  0: 'Not started',
  50: 'In progress',
  100: 'Completed',
};

const EMPTY = '(empty)';

function formatInstant(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PLATFORM_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')}`;
}

function display(field: (typeof FIELD_ORDER)[number], value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (field === 'priority_number') return PRIORITY_LABELS[Number(value)] ?? String(value);
  if (field === 'percent_complete') return PROGRESS_LABELS[Number(value)] ?? `${value}%`;
  if (field === 'due_at' || field === 'start_at') return formatInstant(String(value));
  const text = String(value);
  // Long descriptions make an unreadable card; the full text is still what gets
  // written, only the preview line is clipped.
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

/** A title is a card row's KEY; a 200-character one makes the table unreadable.
 *  The full title is untouched in the data — only this label is clipped. */
function clipTitle(title: string): string {
  return title.length > 60 ? `${title.slice(0, 59)}…` : title;
}

/** The value half of a bulk row. One changed field reads as a sentence on its own
 *  ("Not started → Completed"); two or more need their labels, or the row is a
 *  string of arrows with no subject. */
function changeSummary(task: ActionTaskSnapshot, patch: UpdateTaskActionPatch): string {
  const changed = FIELD_ORDER.filter((f) => patch[f] !== undefined);
  return changed
    .map((f) => {
      const arrow = `${display(f, task[f])} → ${display(f, patch[f])}`;
      return changed.length === 1 ? arrow : `${FIELD_LABELS[f]}: ${arrow}`;
    })
    .join('; ');
}

export interface BuildUpdateApprovalCardOpts {
  task: ActionTaskSnapshot;
  patch: UpdateTaskActionPatch;
  tenantId: string;
  userId: string;
  /** Minted on the suspend pass and embedded in EVERY action's argsPatch, so
   *  whichever path resumes — /chat/resume or resumeRetry — the write is gated
   *  by the same key. */
  idempotencyKey: string;
}

/**
 * The read-only preview of a task change. Confirm / Cancel only: in-card editing
 * was dropped in Amendment B2 so there is exactly one way to correct a
 * proposal — tell the agent (FUT-840).
 *
 * `expectedVersion` rides on the card because preview and Confirm are separated
 * by minutes and can execute in different processes. `updateTask` guards
 * `WHERE version = expected_version`, so carrying the version is what stops a
 * confirmed preview from silently clobbering somebody else's edit.
 */
export function buildUpdateApprovalCard(opts: BuildUpdateApprovalCardOpts): ApprovalCard {
  const { task, patch, tenantId, userId, idempotencyKey } = opts;

  const rows = FIELD_ORDER.filter((f) => patch[f] !== undefined).map((f) => ({
    k: FIELD_LABELS[f],
    v: `${display(f, task[f])} → ${display(f, patch[f])}`,
  }));
  if (rows.length === 0) {
    throw new Error('buildUpdateApprovalCard: patch contains no changes');
  }

  return {
    toolCallId: `planner.action:${task.taskId}`,
    intent: `Update "${task.title}"`,
    riskBadge: 'write',
    summary:
      rows.length === 1
        ? `${rows[0]?.k} will change.`
        : `${rows.length} fields will change on this task.`,
    details: [{ kind: 'kvTable', rows }],
    primary: {
      label: 'Apply the change',
      argsPatch: {
        action: 'update',
        // One shape for one target and for twenty — the resume pass never
        // branches on cardinality.
        targets: [{ taskId: task.taskId, expectedVersion: task.version }],
        patch,
        idempotencyKey,
      },
    },
    // An update has one proposal; there is nothing to choose between.
    alternates: [],
    decline: {
      label: 'Cancel',
      argsPatch: {
        action: 'decline',
        targets: [{ taskId: task.taskId, expectedVersion: task.version }],
        idempotencyKey,
      },
    },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_updateTask',
      ts: new Date().toISOString(),
    },
  };
}

export interface BuildBulkApprovalCardOpts {
  /** In the order the card must render them — the same order as `targets`. */
  tasks: ActionTaskSnapshot[];
  patch: UpdateTaskActionPatch;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
}

/**
 * The preview for a batch: one row per task rather than one row per field.
 * Same `kvTable` block, different grouping — the `diff` block is deliberately
 * not used, because its renderer prints two walls of pretty-printed JSON
 * (design D7, §0.6) and a card never shows raw ids or encoded numbers.
 */
export function buildBulkApprovalCard(opts: BuildBulkApprovalCardOpts): ApprovalCard {
  const { tasks, patch, tenantId, userId, idempotencyKey } = opts;
  if (tasks.length === 0) {
    throw new Error('buildBulkApprovalCard: no targets');
  }
  if (FIELD_ORDER.every((f) => patch[f] === undefined)) {
    throw new Error('buildBulkApprovalCard: patch contains no changes');
  }

  const rows = tasks.map((t) => ({ k: clipTitle(t.title), v: changeSummary(t, patch) }));
  const targets = tasks.map((t) => ({ taskId: t.taskId, expectedVersion: t.version }));

  return {
    // Keyed on the idempotency key rather than the targets: twenty joined UUIDs
    // is not an identifier, and nothing parses this field — the resume route
    // reads the tool call id off the Mastra event, not off the card.
    toolCallId: `planner.action:${idempotencyKey}`,
    intent: `Update ${tasks.length} tasks`,
    riskBadge: 'write',
    summary: `${tasks.length} tasks will change.`,
    details: [{ kind: 'kvTable', rows }],
    primary: {
      label: 'Apply the change',
      argsPatch: { action: 'update', targets, patch, idempotencyKey },
    },
    alternates: [],
    decline: {
      label: 'Cancel',
      argsPatch: { action: 'decline', targets, idempotencyKey },
    },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_updateTask',
      ts: new Date().toISOString(),
    },
  };
}

/** Reads as a sentence about the two titles, not as an enum value the user has
 *  to decode. Matches the kind-semantics table in the design §3.1. */
const LINK_SENTENCE: Record<ToolTaskLinkKind, (a: string, b: string) => string> = {
  relates: (a, b) => `${a} is related to ${b}`,
  duplicates: (a, b) => `${a} is a duplicate of ${b}`,
  blocks: (a, b) => `${a} blocks ${b}`,
};

export interface BuildLinkApprovalCardOpts {
  source: ActionTaskSnapshot;
  target: ActionTaskSnapshot;
  kind: ToolTaskLinkKind;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
}

/** A link deletes nothing, so `riskBadge` is `write`. Merge, which trashes a
 *  task, is `destructive` — the badge is the user's one visual cue. */
export function buildLinkApprovalCard(opts: BuildLinkApprovalCardOpts): ApprovalCard {
  const { source, target, kind, tenantId, userId, idempotencyKey } = opts;
  const sourceTitle = clipTitle(source.title);
  const targetTitle = clipTitle(target.title);
  const ids = {
    sourceTaskId: source.taskId,
    targetTaskId: target.taskId,
    kind,
    idempotencyKey,
  };

  return {
    toolCallId: `planner.action:${idempotencyKey}`,
    intent: `Link "${sourceTitle}" to "${targetTitle}"`,
    riskBadge: 'write',
    summary: 'These two tasks will be linked.',
    details: [
      {
        kind: 'kvTable',
        rows: [
          { k: 'From', v: sourceTitle },
          { k: 'To', v: targetTitle },
          { k: 'Relationship', v: LINK_SENTENCE[kind](sourceTitle, targetTitle) },
        ],
      },
    ],
    primary: { label: 'Link them', argsPatch: { action: 'link', ...ids } },
    alternates: [],
    decline: { label: 'Cancel', argsPatch: { action: 'decline', ...ids } },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_linkTasks',
      ts: new Date().toISOString(),
    },
  };
}

export interface BuildMergeApprovalCardOpts {
  duplicate: ActionTaskSnapshot;
  keep: ActionTaskSnapshot;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
}

/**
 * The destructive card. Two rules it must never break:
 *  - it says which task goes to the trash, by TITLE, in the first row;
 *  - it promises "can be restored from trash" and nothing stronger. Restore
 *    brings the task back, but the `duplicates` link row survives the restore, so
 *    "undo" would leave a live task marked as a duplicate of another live task.
 */
export function buildMergeApprovalCard(opts: BuildMergeApprovalCardOpts): ApprovalCard {
  const { duplicate, keep, tenantId, userId, idempotencyKey } = opts;
  const dupTitle = clipTitle(duplicate.title);
  const keepTitle = clipTitle(keep.title);
  const ids = {
    duplicateTaskId: duplicate.taskId,
    // Only the duplicate changes state; the keeper merely gains an inbound link.
    duplicateExpectedVersion: duplicate.version,
    keepTaskId: keep.taskId,
    idempotencyKey,
  };

  return {
    toolCallId: `planner.action:${idempotencyKey}`,
    intent: `Merge "${dupTitle}" into "${keepTitle}"`,
    riskBadge: 'destructive',
    summary: `"${dupTitle}" will be moved to the trash. It can be restored from trash if this was wrong.`,
    details: [
      {
        kind: 'kvTable',
        rows: [
          { k: 'Moved to trash', v: dupTitle },
          { k: 'Kept', v: keepTitle },
          { k: 'Also', v: `"${dupTitle}" will be marked as a duplicate of "${keepTitle}"` },
        ],
      },
    ],
    primary: { label: 'Merge them', argsPatch: { action: 'merge', ...ids } },
    alternates: [],
    decline: { label: 'Cancel', argsPatch: { action: 'decline', ...ids } },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_mergeTasks',
      ts: new Date().toISOString(),
    },
  };
}

export interface BuildAssignTaskApprovalCardOpts {
  taskId: string;
  title: string;
  /** Who owns the task now. Empty is normal and must read as "Nobody". */
  before: Array<{ userId: string; name: string }>;
  /** The COMPLETE set after the change — what setAssignees receives. */
  after: Array<{ userId: string; name: string }>;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
}

const NOBODY = 'Nobody';

function names(people: Array<{ name: string }>): string {
  return people.length === 0 ? NOBODY : people.map((p) => p.name).join(', ');
}

/**
 * The preview for a user-named assignment. Two rules it must never break:
 *
 *  - it shows BOTH sides. This tool replaces the assignee set, so "assign this
 *    to A" on a task owned by B removes B — and `Now: Bình → After: Tuấn` is the
 *    only thing that lets the user catch a reading they did not mean (design D5).
 *  - it proposes NOBODY ELSE (design D11). The user named the people; a card
 *    that offers alternatives here is a recommendation nobody asked for, and a
 *    recommend card is what the OTHER runtime builds. `alternates: []` and the
 *    absence of an entityList block are what make the shared renderer show
 *    confirm/cancel rather than candidate rows.
 */
export function buildAssignTaskApprovalCard(opts: BuildAssignTaskApprovalCardOpts): ApprovalCard {
  const { taskId, title, before, after, tenantId, userId, idempotencyKey } = opts;
  const ids = { taskId, idempotencyKey };

  return {
    toolCallId: `planner.action:${idempotencyKey}`,
    intent: `Assign "${clipTitle(title)}"`,
    riskBadge: 'write',
    summary:
      after.length === 1
        ? `${after[0]?.name} will be the only assignee.`
        : `${after.length} people will be assigned.`,
    details: [
      {
        kind: 'kvTable',
        rows: [
          { k: 'Task', v: clipTitle(title) },
          { k: 'Now', v: names(before) },
          { k: 'After', v: names(after) },
        ],
      },
    ],
    primary: {
      label: `Assign to ${names(after)}`,
      argsPatch: { action: 'assign', ...ids, assigneeUserIds: after.map((p) => p.userId) },
    },
    alternates: [],
    decline: { label: 'Cancel', argsPatch: { action: 'decline', ...ids } },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_assignTask',
      // The same string the recommend card declares, so the two cannot both be
      // pending for one task and confirming either clears the other (design D7).
      dedupKey: `assign:${taskId}`,
      ts: new Date().toISOString(),
    },
  };
}
