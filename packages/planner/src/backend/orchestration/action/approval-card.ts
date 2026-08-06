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
        taskId: task.taskId,
        patch,
        expectedVersion: task.version,
        idempotencyKey,
      },
    },
    // An update has one proposal; there is nothing to choose between.
    alternates: [],
    decline: {
      label: 'Cancel',
      argsPatch: {
        action: 'decline',
        taskId: task.taskId,
        expectedVersion: task.version,
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
