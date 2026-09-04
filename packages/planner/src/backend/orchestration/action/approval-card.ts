import type { ApprovalCard } from '@seta/agent-sdk';
import { PLATFORM_TIMEZONE } from '@seta/agent-sdk';
import type { ActionTaskSnapshot, UpdateTaskActionPatch } from './schemas.ts';

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
      toolId: 'planner_updateTask',
      ts: new Date().toISOString(),
    },
  };
}
