import type { ApprovalCard } from '@seta/agent-sdk';
import { PLATFORM_TIMEZONE } from '@seta/agent-sdk';
import { ACTION_WORKFLOW_ID } from './orchestrator-spec.ts';
import type {
  ActionTaskSnapshot,
  CreateTaskDraft,
  ToolTaskLinkKind,
  UpdateTaskActionPatch,
} from './schemas.ts';

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

/** The generalized one-preview-per-task mutex key (FUT-840 design D11). Every A2
 *  card that is ABOUT an existing task declares one per task it touches, so the
 *  writer can refuse a second pending preview for the same task. Create declares
 *  none: there is no task yet. */
function taskKey(taskId: string): string {
  return `task:${taskId}`;
}

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
  /** The approval this card REPLACES, when the user revised an open preview
   *  (FUT-840 design D8). The writer voids it in the same transaction as the
   *  INSERT, so no committed instant has two pending cards for one task. */
  supersedes?: string;
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
  const { task, patch, tenantId, userId, idempotencyKey, supersedes } = opts;

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
      dedupKeys: [taskKey(task.taskId)],
      ...(supersedes ? { supersedes } : {}),
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
  /** See `BuildUpdateApprovalCardOpts.supersedes`. */
  supersedes?: string;
}

/**
 * The preview for a batch: one row per task rather than one row per field.
 * Same `kvTable` block, different grouping — the `diff` block is deliberately
 * not used, because its renderer prints two walls of pretty-printed JSON
 * (design D7, §0.6) and a card never shows raw ids or encoded numbers.
 */
export function buildBulkApprovalCard(opts: BuildBulkApprovalCardOpts): ApprovalCard {
  const { tasks, patch, tenantId, userId, idempotencyKey, supersedes } = opts;
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
      dedupKeys: tasks.map((t) => taskKey(t.taskId)),
      ...(supersedes ? { supersedes } : {}),
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
  /** See `BuildUpdateApprovalCardOpts.supersedes`. */
  supersedes?: string;
}

/** A link deletes nothing, so `riskBadge` is `write`. Merge, which trashes a
 *  task, is `destructive` — the badge is the user's one visual cue. */
export function buildLinkApprovalCard(opts: BuildLinkApprovalCardOpts): ApprovalCard {
  const { source, target, kind, tenantId, userId, idempotencyKey, supersedes } = opts;
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
      dedupKeys: [taskKey(source.taskId), taskKey(target.taskId)],
      ...(supersedes ? { supersedes } : {}),
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
  /** See `BuildUpdateApprovalCardOpts.supersedes`. */
  supersedes?: string;
}

/**
 * The destructive card. Two rules it must never break:
 *  - it says which task goes to the trash, by TITLE, in the first row;
 *  - it promises "can be restored from trash" and nothing stronger. Restore
 *    brings the task back, but the `duplicates` link row survives the restore, so
 *    "undo" would leave a live task marked as a duplicate of another live task.
 */
export function buildMergeApprovalCard(opts: BuildMergeApprovalCardOpts): ApprovalCard {
  const { duplicate, keep, tenantId, userId, idempotencyKey, supersedes } = opts;
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
      dedupKeys: [taskKey(duplicate.taskId), taskKey(keep.taskId)],
      ...(supersedes ? { supersedes } : {}),
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
  /** See `BuildUpdateApprovalCardOpts.supersedes`. */
  supersedes?: string;
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
  const { taskId, title, before, after, tenantId, userId, idempotencyKey, supersedes } = opts;
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
      // BOTH keys, assign FIRST. `assign:` is the string the recommend card
      // declares, so the two cannot both be pending for one task and confirming
      // either clears the other (design D7). `task:` brings assign cards under
      // the generalized one-preview-per-task rule. Keys are evaluated in
      // DECLARATION ORDER and the first hit wins (design D11), so an A2 assign
      // card satisfying both rules resolves as REUSE, never as a refusal.
      dedupKeys: [`assign:${taskId}`, taskKey(taskId)],
      ...(supersedes ? { supersedes } : {}),
      ts: new Date().toISOString(),
    },
  };
}

export interface BuildCommentTaskApprovalCardOpts {
  taskId: string;
  title: string;
  body: string;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
  /** See `BuildUpdateApprovalCardOpts.supersedes`. */
  supersedes?: string;
}

/**
 * The comment preview. The body is shown VERBATIM and unclipped: the user is
 * confirming text, and a truncated preview would mean confirming words they have
 * not read. Only the task title is clipped, because that is a label.
 *
 * It rides in its own `text` block rather than as a `kvTable` value, because
 * `display()` clips every table value at 140 characters.
 */
export function buildCommentTaskApprovalCard(opts: BuildCommentTaskApprovalCardOpts): ApprovalCard {
  const { taskId, title, body, tenantId, userId, idempotencyKey, supersedes } = opts;
  return {
    toolCallId: `planner.action:${idempotencyKey}`,
    intent: `Comment on "${clipTitle(title)}"`,
    riskBadge: 'write',
    summary: 'This comment will be posted as you.',
    details: [
      { kind: 'kvTable', rows: [{ k: 'Task', v: clipTitle(title) }] },
      { kind: 'text', body },
    ],
    primary: {
      label: 'Post comment',
      argsPatch: { action: 'comment', taskId, body, idempotencyKey },
    },
    // The user wrote the words; there is nothing to offer as an alternative.
    alternates: [],
    decline: { label: 'Cancel', argsPatch: { action: 'decline', taskId, idempotencyKey } },
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_commentTask',
      dedupKeys: [taskKey(taskId)],
      ...(supersedes ? { supersedes } : {}),
      ts: new Date().toISOString(),
    },
  };
}

export interface BuildCreateTaskApprovalCardOpts {
  planId: string;
  planName: string;
  /** The column the task will land in, resolved by the server. Required, because
   *  a task with no bucket is one the plan board cannot render at all. */
  bucketId: string;
  bucketName: string;
  draft: CreateTaskDraft;
  /** Ranked, already thresholded. Only the first three become branches. */
  similar: Array<{ taskId: string; title: string; score: number }>;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
  /** See `BuildUpdateApprovalCardOpts.supersedes`. */
  supersedes?: string;
}

const MAX_DUPLICATE_BRANCHES = 3;

/**
 * The create preview, with the duplicate escape ON THE SAME CARD.
 *
 * AC1 falls out of this shape rather than out of prompt text: no task exists
 * before Confirm because the write lives on the resume pass; the duplicate check
 * ran before the card because it ran before suspend(); the alternative to
 * creating is a branch, so it cannot be forgotten; and Cancel leaves nothing
 * because no gateway call ever happened.
 */
export function buildCreateTaskApprovalCard(opts: BuildCreateTaskApprovalCardOpts): ApprovalCard {
  const {
    planId,
    planName,
    bucketId,
    bucketName,
    draft,
    similar,
    tenantId,
    userId,
    idempotencyKey,
    supersedes,
  } = opts;
  const shortlist = similar.slice(0, MAX_DUPLICATE_BRANCHES);

  const rows: Array<{ k: string; v: string }> = [
    { k: 'Title', v: clipTitle(draft.title) },
    { k: 'Plan', v: planName },
    // The one row the user did not choose, and the only one that decides
    // whether they can see the task afterwards. Silence here would mean
    // confirming a placement they were never shown.
    { k: 'Bucket', v: bucketName },
  ];
  // Only fields the user actually gave: an empty row is a value they did not
  // choose, presented as if they had.
  if (draft.description) rows.push({ k: 'Description', v: clipTitle(draft.description) });
  if (draft.startAt) rows.push({ k: 'Start', v: formatInstant(draft.startAt) });
  if (draft.dueAt) rows.push({ k: 'Due', v: formatInstant(draft.dueAt) });
  if (draft.priority) rows.push({ k: 'Priority', v: draft.priority });
  if (draft.labels?.length) rows.push({ k: 'Labels', v: draft.labels.join(', ') });

  const details: ApprovalCard['details'] = [{ kind: 'kvTable', rows }];
  if (shortlist.length > 0) {
    details.push({
      kind: 'text',
      body:
        shortlist.length === 1
          ? 'Found 1 similar task already in this plan — you can use it instead.'
          : `Found ${shortlist.length} similar tasks already in this plan — you can use one instead.`,
    });
  }

  return {
    toolCallId: `planner.action:${idempotencyKey}`,
    intent: `Create a task in "${planName}"?`,
    riskBadge: 'write',
    summary: clipTitle(draft.title),
    details,
    primary: {
      label: 'Create task',
      argsPatch: { action: 'create', planId, bucketId, draft, idempotencyKey },
    },
    // Ranked; the same idempotencyKey on every branch, because an approval can
    // be consumed once and the key belongs to the decision, not the branch.
    alternates: shortlist.map((s) => ({
      label: `Use "${clipTitle(s.title)}"`,
      argsPatch: { action: 'use_existing', existingTaskId: s.taskId, idempotencyKey },
    })),
    decline: { label: 'Cancel', argsPatch: { action: 'decline', idempotencyKey } },
    // No meta.dedupKeys: create has no mutex, because there is no task yet to be
    // the subject of one.
    meta: {
      tenantId,
      userId,
      agentPath: ['action', 'orchestrator'],
      workflowId: ACTION_WORKFLOW_ID,
      toolId: 'planner_createTask',
      ...(supersedes ? { supersedes } : {}),
      ts: new Date().toISOString(),
    },
  };
}
